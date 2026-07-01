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

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
include("run_all_models.jl")

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
