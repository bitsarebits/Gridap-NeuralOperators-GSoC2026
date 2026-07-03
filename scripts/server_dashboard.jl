import Pkg

# @__DIR__ is always 'experiments_NeuralOperators/scripts'
# The project root for these experiments is one level up
const EXPERIMENT_ROOT = joinpath(@__DIR__, "..")

@info "Bootstrapping Julia environment..."
Pkg.activate(EXPERIMENT_ROOT)
Pkg.instantiate()


using DrWatson

@quickactivate :experiments_NeuralOperators

using Oxygen
using HTTP
using JSON3
using Sockets
using UUIDs
using Base64
using Dates

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
using experiments_NeuralOperators.Auth
using experiments_NeuralOperators.FirebaseREST
include("run_all_models.jl")

# Check for credentials via autodiscovery
const FIREBASE_CRED = Auth.get_firebase_credentials()
const HAS_FIREBASE_ACCESS = !isnothing(FIREBASE_CRED)

@info "Firebase Server-to-Server Auth Status: $(HAS_FIREBASE_ACCESS ? "ENABLED" : "DISABLED")"

# Endpoint for the React frontend capability check
@get "/api/status" function (req::HTTP.Request)
    return JSON3.write(Dict("canShare" => HAS_FIREBASE_ACCESS))
end

# PRODUCER
# Keep the session_id also if the web task get refreshed. Doesn't depend from the WebSocket
# Keep track of running background tasks (Simulations)
const ACTIVE_TASKS = Dict{String,Task}()

# PRODUCER CHANNEL
# Keep track of the message queues for each session (Buffer: 1000 messages)
const SESSION_CHANNELS = Dict{String,Channel{String}}()

# CONSUMER (light task, from channel to webSocket)
# Killed when web task get killed or refreshed, new one created for the new WebSocket
# Keep track of the WebSocket sender tasks to ensure type-stability
const SENDER_TASKS = Dict{String,Task}()

# CORS Middleware
# Required during development because Vite runs on port 5173
# and Julia runs on port 8080. This allows them to communicate.
function cors_middleware(handler)
    return function (req::HTTP.Request)
        # Handle preflight OPTIONS requests sent by browsers
        if req.method == "OPTIONS"
            return HTTP.Response(200, [
                "Access-Control-Allow-Origin" => "*",
                "Access-Control-Allow-Headers" => "*",
                "Access-Control-Allow-Methods" => "POST, GET, OPTIONS"
            ])
        end

        # Process the actual request
        response = handler(req)

        # Attach CORS headers to the final response
        HTTP.setheader(response, "Access-Control-Allow-Origin" => "*")
        return response
    end
end

# Helper function to build Julia structs from JSON payload
function build_configs(payload)
    # Construct FEMConfig (using dictionary unpacking)
    fem_config = FEMConfig(; Dict(Symbol(k) => v for (k, v) in pairs(payload["fem_config"]))...)

    # Construct EvalConfig (using dictionary unpacking)
    eval_config = EvalConfig(; Dict(Symbol(k) => v for (k, v) in pairs(payload["eval_config"]))...)

    # Construct LR Scheduler
    sched_data = payload["scheduler"]
    local scheduler::AbstractLRScheduler

    if sched_data["type"] == "CosineAnnealing"
        scheduler = CosineAnnealing(
            lr_max=Float32(sched_data["ca_lr_max"]),
            lr_min=Float32(sched_data["ca_lr_min"]),
            max_epochs=Int(payload["solver"]["epochs"])
        )
    elseif sched_data["type"] == "ReduceLROnPlateau"
        scheduler = ReduceLROnPlateau(
            patience=Int(sched_data["rop_patience"]),
            factor=Float32(sched_data["rop_factor"]),
            min_lr=Float32(sched_data["rop_min_lr"]),
            start_lr=Float32(sched_data["rop_start_lr"])
        )
    else
        error("Unknown Scheduler Type: $(sched_data["type"])")
    end

    # Construct Neural Solver
    solver_data = payload["solver"]
    local solver::AbstractNeuralSolver

    if solver_data["type"] == "DeepONet"
        solver = DeepONetSolver(
            epochs=Int(solver_data["epochs"]),
            step_x=Int(solver_data["step_x"]),
            step_t=Int(solver_data["step_t"]),
            m_sensors=Int(solver_data["m_sensors"]),
            p_latent=Int(solver_data["p_latent"]),
            hidden=Int(solver_data["hidden"]),
            lr_scheduler=scheduler
        )
    elseif solver_data["type"] == "FNO"
        parsed_hidden = Tuple(parse.(Int, split(solver_data["hidden_channels"], ",")))
        parsed_modes = Tuple(parse.(Int, split(solver_data["modes"], ",")))

        solver = FNOSolver(
            epochs=Int(solver_data["epochs"]),
            nx_red=Int(solver_data["nx_red"]),
            nt_red=Int(solver_data["nt_red"]),
            hidden_channels=parsed_hidden,
            modes=parsed_modes,
            lr_scheduler=scheduler
        )
    else
        error("Unknown Solver Type: $(solver_data["type"])")
    end

    return fem_config, solver, eval_config
end

# Endpoint to verify the server is compiled and ready
@get "/api/ping" function (req::HTTP.Request)
    return JSON3.write(Dict("status" => "ok", "message" => "Julia Backend Ready"))
end

# Endpoint WebSocket
@websocket "/ws/simulate" function (ws::HTTP.WebSocket)
    local session_id = nothing

    try
        for msg in ws
            payload = JSON3.read(msg)
            action = payload["action"]

            # START or RECONNECT logic
            if action == "start" || action == "reconnect"
                # Safely extract session_id, falling back to a new UUID if missing or explicitly null
                if haskey(payload, "session_id") && payload["session_id"] !== nothing
                    session_id = String(payload["session_id"])
                else
                    session_id = string(uuid4())
                end

                # Send the session ID back to the client immediately
                HTTP.WebSockets.send(ws, JSON3.write(Dict("type" => "session_info", "session_id" => session_id)))

                if action == "start" && !haskey(ACTIVE_TASKS, session_id)
                    # Create a channel with a buffer of 1000 messages
                    SESSION_CHANNELS[session_id] = Channel{String}(1000)

                    t = Threads.@spawn begin
                        try
                            # Non-blocking logger: pushes to channel, drops oldest if full
                            log_cb = (info) -> begin
                                if haskey(SESSION_CHANNELS, session_id)
                                    ch = SESSION_CHANNELS[session_id]
                                    if length(ch.data) >= ch.sz_max
                                        take!(ch) # Prevent blocking the simulation
                                    end
                                    put!(ch, JSON3.write(info))
                                end
                            end

                            log_cb(Dict("type" => "status", "stage" => "Configuration received..."))

                            fem_config, solver, eval_config = build_configs(payload["data"])

                            data_hash, model_hash, eval_hash = run_pipeline(
                                solver, fem_config, eval_config;
                                log_cb=log_cb
                            )

                            solver_name = get_solver_name(solver)
                            image_path = plotsdir(lowercase(solver_name), "eval_$(eval_hash).png")

                            if isfile(image_path)
                                image_b64 = base64encode(read(image_path))
                                image_url = "data:image/png;base64," * image_b64
                            else
                                error("Image not found on disk after generation")
                            end

                            log_cb(Dict(
                                "type" => "success",
                                "data_hash" => data_hash,
                                "model_hash" => model_hash,
                                "eval_hash" => eval_hash,
                                "image_url" => image_url
                            ))
                        catch e
                            if e isa InterruptException || (e isa TaskFailedException && occursin("InterruptException", string(e)))
                                if haskey(SESSION_CHANNELS, session_id)
                                    put!(SESSION_CHANNELS[session_id], JSON3.write(Dict("type" => "error", "message" => "Simulation interrupted by the user.")))
                                end
                            else
                                @error "Simulation failed" exception=(e, catch_backtrace())
                                if haskey(SESSION_CHANNELS, session_id)
                                    put!(SESSION_CHANNELS[session_id], JSON3.write(Dict("type" => "error", "message" => sprint(showerror, e))))
                                end
                            end
                        finally
                            # Cleanup
                            delete!(ACTIVE_TASKS, session_id)
                            # Close the channel to automatically terminate the sender_task loop
                            if haskey(SESSION_CHANNELS, session_id)
                                close(SESSION_CHANNELS[session_id])
                                delete!(SESSION_CHANNELS, session_id)
                            end
                        end
                    end
                    ACTIVE_TASKS[session_id] = t
                end

                # Kill existing sender task for this socket if any
                if haskey(SENDER_TASKS, session_id)
                    old_sender = SENDER_TASKS[session_id]
                    if !istaskdone(old_sender)
                        try
                            Base.throwto(old_sender, InterruptException())
                        catch
                            # Ignore errors when killing the old sender
                        end
                    end
                end

                # Start the async Sender Task that streams from Channel to WebSocket
                SENDER_TASKS[session_id] = Threads.@spawn begin
                    try
                        if haskey(SESSION_CHANNELS, session_id)
                            ch = SESSION_CHANNELS[session_id]
                            for log_msg in ch
                                if HTTP.WebSockets.isclosed(ws)
                                    break
                                end
                                HTTP.WebSockets.send(ws, log_msg)
                            end
                        end
                    catch
                        # Ignore closed stream errors securely
                    end
                end

            elseif action == "stop"
                if session_id !== nothing && haskey(ACTIVE_TASKS, session_id)
                    @info "User requested abort for session: $session_id"
                    t_abort = ACTIVE_TASKS[session_id]

                    Threads.@spawn begin
                        if !istaskdone(t_abort)
                            try
                                Base.throwto(t_abort, InterruptException())
                            catch err
                                @warn "Graceful interruption failed: $err"
                            end
                        end
                    end
                end
            end
        end
    finally
        # Only kill the sender task. Leave the simulation task running!
        if session_id !== nothing && haskey(SENDER_TASKS, session_id)
            s_task = SENDER_TASKS[session_id]
            if !istaskdone(s_task)
                try
                    Base.throwto(s_task, InterruptException())
                catch
                    # Ignore cleanup errors
                end
            end
            delete!(SENDER_TASKS, session_id)
        end
        @info "WebSocket disconnected for session: $(session_id !== nothing ? session_id : "unknown")"
    end
end

@post "/api/check_registry" function (req::HTTP.Request)
    try
        # Parse incoming JSON payload
        payload = JSON3.read(req.body)

        # Build configs
        fem_config, solver, eval_config = build_configs(payload)

        solver_name = get_solver_name(solver)

        # Check Data Hash
        data_hash = HashRegistry.config_hash(fem_config)
        data_exists = HashRegistry.check_registry("data", data_hash)

        # Check Model Hash
        model_dict = Dict(
            "solver_type" => solver_name,
            "solver" => HashRegistry.struct_to_dict(solver),
            "data_hash" => data_hash
        )
        model_hash = HashRegistry.config_hash(model_dict)
        model_exists = HashRegistry.check_registry("models", model_hash)

        # Check Eval Hash
        eval_dict = Dict(
            "model_hash" => model_hash,
            "eval_config" => HashRegistry.struct_to_dict(eval_config)
        )
        eval_hash = HashRegistry.config_hash(eval_dict)
        eval_exists = HashRegistry.check_registry("evaluations", eval_hash)

        return JSON3.write(Dict(
            "status" => "success",
            "data_exists" => data_exists,
            "model_exists" => model_exists,
            "eval_exists" => eval_exists
        ))

    catch e
        @error "Cache check failed" exception=(e, catch_backtrace())
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => sprint(showerror, e)
            )))
    end
end

# Endpoint to fetch the entire cache registry
@get "/api/registry" function (req::HTTP.Request)
    try
        registry = HashRegistry.load_registry()
        return JSON3.write(Dict("status" => "success", "data" => registry))
    catch e
        @error "Failed to load registry" exception=(e, catch_backtrace())
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e)))
        )
    end
end

# Endpoint to Fetch a specific evaluation plot from disk as Base64
@post "/api/get_evaluation_plot" function (req::HTTP.Request)
    try
        payload = JSON3.read(req.body)
        eval_hash = String(payload["eval_hash"])
        solver_type = lowercase(String(payload["solver_type"]))

        image_path = plotsdir(solver_type, "eval_$(eval_hash).png")

        if isfile(image_path)
            image_b64 = base64encode(read(image_path))
            image_url = "data:image/png;base64," * image_b64
            return JSON3.write(Dict("status" => "success", "image_url" => image_url))
        else
            return HTTP.Response(
                404,
                ["Content-Type" => "application/json"],
                JSON3.write(Dict("status" => "error", "message" => "Plot image not found on disk."))
            )
        end
    catch e
        @error "Failed to retrieve evaluation plot" exception=(e, catch_backtrace())
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e)))
        )
    end
end

@post "/api/share" function (req::HTTP.Request)
    # Global Capability Check
    if !HAS_FIREBASE_ACCESS
        return HTTP.Response(
            403,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Firebase publishing is disabled. Missing credentials."))
        )
    end

    # Parse Payload
    local payload::Dict{String,Any}
    try
        payload = JSON3.read(req.body, Dict{String,Any})
    catch e
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Invalid JSON payload."))
        )
    end

    eval_hash = get(payload, "eval_hash", nothing)

    if isnothing(eval_hash) || isempty(eval_hash)
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Missing eval_hash parameter."))
        )
    end

    # Integrity & Dependency Check via HashRegistry
    registry = HashRegistry.load_registry()

    if !haskey(registry["evaluations"], eval_hash)
        @warn "Tamper attempt or missing cache for eval_hash: $eval_hash"
        return HTTP.Response(
            404,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Evaluation hash not found in local registry. Cannot verify mathematical integrity."))
        )
    end

    # Reconstruct the full computational graph from the registry
    eval_data = registry["evaluations"][eval_hash]
    model_hash = eval_data["model_hash"]
    model_data = registry["models"][model_hash]
    data_hash = model_data["data_hash"]
    data_config = registry["data"][data_hash]

    solver_type_raw = model_data["solver_type"]
    solver_type = lowercase(solver_type_raw)

    # Verify the image exists locally
    image_path = plotsdir(solver_type, "eval_$(eval_hash).png")
    data_path = datadir("sims", "data_$(data_hash).jld2")
    model_path = datadir("models", solver_type, "model_$(model_hash).jld2")

    if !isfile(image_path) || !isfile(data_path) || !isfile(model_path)
        return HTTP.Response(404, ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => "Some required files (plot, data, or model) are missing from disk."
            )))
    end

    # Generate Server-to-Server Token
    @info "Starting Firebase publishing process for experiment $eval_hash..."
    token = FirebaseREST.get_access_token()

    if isnothing(token)
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Failed to authenticate securely with Firebase."))
        )
    end

    if FirebaseREST.check_document_exists(token, "shared_experiments", eval_hash)
        @info "Experiment $eval_hash is already in the global gallery. Skipping upload."

        # Get the project_id to reconstruct the image URL
        cred = Auth.get_firebase_credentials()
        project_id = cred["project_id"]
        bucket_name = "$(project_id).firebasestorage.app"

        # reconstruct the URL
        reconstructed_url = "https://firebasestorage.googleapis.com/v0/b/$(bucket_name)/o/plots%2F$(eval_hash).png?alt=media"

        return JSON3.write(Dict(
            "status" => "success",
            "message" => "Experiment is already published in the gallery!",
            "public_url" => reconstructed_url,
            "already_exists" => true
        ))
    end

    # Upload Data, Model and Plot to Cloud Storage
    @info "Uploading evaluation plot..."
    image_url = FirebaseREST.upload_to_storage(token, image_path, "plots/$(eval_hash).png"; content_type="image/png")

    @info "Uploading high-fidelity FEM data..."
    data_url = FirebaseREST.upload_to_storage(token, data_path, "data/$(data_hash).jld2")

    @info "Uploading Neural Operator weights..."
    model_url = FirebaseREST.upload_to_storage(token, model_path, "models/$(model_hash).jld2")

    if isnothing(image_url) || isnothing(data_url) || isnothing(model_url)
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => "Failed to upload one or more files to Cloud Storage."
            )))
    end

    # Push Metadata to Firestore
    doc_payload = Dict(
        "experiment_id" => eval_hash,
        "timestamp" => Dates.format(now(UTC), "yyyy-mm-ddTHH:MM:SSZ"),
        "model_type" => model_data["solver_type"],
        "hashes" => Dict(
            "data_hash" => data_hash,
            "model_hash" => model_hash,
            "eval_hash" => eval_hash
        ),
        "fem_config" => data_config,
        "solver_config" => model_data["solver"],
        "eval_config" => eval_data["eval_config"],
        "image_url" => image_url,
        "data_url" => data_url,
        "model_url" => model_url
    )

    success = FirebaseREST.push_to_firestore(token, "shared_experiments", eval_hash, doc_payload)

    if success
        @info "Publishing completed successfully for $eval_hash."
        return JSON3.write(Dict(
            "status" => "success",
            "message" => "Experiment published successfully to the global gallery!",
            "public_url" => image_url,
            "already_exists" => false
        ))
    else
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Failed to push structured metadata to Firestore."))
        )
    end
end

# Sync simulation endpoint: Downloads remote experiments to local DrWatson workspace
@post "/api/sync_experiment" function (req::HTTP.Request)
    # Parse Payload
    local payload::Dict{String,Any}
    try
        payload = JSON3.read(req.body, Dict{String,Any})
    catch e
        return HTTP.Response(400, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Invalid JSON payload.")))
    end

    eval_hash = get(payload, "eval_hash", nothing)
    if isnothing(eval_hash)
        return HTTP.Response(400, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Missing eval_hash.")))
    end

    @info "Starting sync for experiment $eval_hash into local workspace..."

    # Extract hashes and URLs
    hashes = payload["hashes"]
    data_hash = hashes["data_hash"]
    model_hash = hashes["model_hash"]

    # Define DrWatson destination paths
    solver_type = lowercase(payload["model_type"])

    data_dest = datadir("sims", "data_$(data_hash).jld2")
    model_dest = datadir("models", solver_type, "model_$(model_hash).jld2")
    plot_dest = plotsdir(solver_type, "eval_$(eval_hash).png")

    # Ensure directories exist
    mkpath(dirname(model_dest))
    mkpath(dirname(plot_dest))

    # Download files synchronously
    try
        @info "Downloading FEM data..."
        HTTP.download(payload["data_url"], data_dest)

        @info "Downloading Model weights..."
        HTTP.download(payload["model_url"], model_dest)

        @info "Downloading Evaluation plot..."
        HTTP.download(payload["image_url"], plot_dest)
    catch e
        @error "Failed to download files from Firebase Storage" exception=(e, catch_backtrace())
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Network error during file download.")))
    end

    # Update Local Registry via HashRegistry
    try
        registry = HashRegistry.load_registry()

        # Insert if not exists
        if !haskey(registry["data"], data_hash)
            registry["data"][data_hash] = payload["fem_config"]
        end

        if !haskey(registry["models"], model_hash)
            # Reconstruct the solver object expected by local cache
            solver_dict = payload["solver_config"]
            registry["models"][model_hash] = Dict(
                "solver_type" => payload["model_type"],
                "solver" => solver_dict,
                "data_hash" => data_hash
            )
        end

        if !haskey(registry["evaluations"], eval_hash)
            registry["evaluations"][eval_hash] = Dict(
                "model_hash" => model_hash,
                "eval_config" => payload["eval_config"]
            )
        end

        HashRegistry.save_registry(registry)
        @info "Registry updated successfully for $eval_hash."

    catch e
        @error "Failed to update local registry.json" exception=(e, catch_backtrace())
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Failed to update local cache registry.")))
    end

    return JSON3.write(Dict(
        "status" => "success",
        "message" => "Experiment synced to local workspace."
    ))
end

# Define the path to the React static build
const BUILD_DIR = joinpath(@__DIR__, "..", "dashboard", "dist")

# Serve the static dashboard if the build directory exists
if isdir(BUILD_DIR)
    @info "Serving static React dashboard from: $BUILD_DIR"

    # Mount the entire dist folder to the root route
    staticfiles(BUILD_DIR, "/")

    # Optional: Catch-all route for SPA client-side routing (React Router)
    # If a user refreshes a page on a specific route, serve index.html
    @get "/*" function (req::HTTP.Request)
        return HTTP.Response(200, ["Content-Type" => "text/html"], read(joinpath(BUILD_DIR, "index.html")))
    end
else
    @warn "Dashboard build directory not found. Please run 'npm run build' inside the 'dashboard' folder."
end

# Start the Server
println("\n===================================================================")
println("🚀 GridapROMs API Server is running!")
println("📡 Listening for React Dashboard on: http://127.0.0.1:8080")
println("🔌 WebSocket Engine on: ws://127.0.0.1:8080/ws/simulate")
println("===================================================================\n")

# Attach the CORS middleware and start serving
serve(host="127.0.0.1", port=8080, middleware=[cors_middleware])
