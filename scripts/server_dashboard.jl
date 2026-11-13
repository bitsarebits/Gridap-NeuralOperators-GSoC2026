import Pkg

# @__DIR__ is always 'experiments_NeuralOperators/scripts'
# The project root for these experiments is one level up
const EXPERIMENT_ROOT = joinpath(@__DIR__, "..")

# Execute Pkg.instantiate() only if not in a Docker container
if !haskey(ENV, "JULIA_SERVER_HOST")
    @info "Bootstrapping Julia environment..."
    Pkg.activate(EXPERIMENT_ROOT)
    Pkg.instantiate()
else
    Pkg.activate(EXPERIMENT_ROOT)
end

using DrWatson

@quickactivate :experiments_NeuralOperators

# Ensure required workspace directories exist on startup (especially on fresh bind mounts)
mkpath(datadir("sims"))
mkpath(datadir("models"))
mkpath(plotsdir())

using Oxygen
using HTTP
using JSON3
using CodecZlib
using Sockets
using UUIDs
using Dates

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
using experiments_NeuralOperators.Auth
using experiments_NeuralOperators.FirebaseREST
using experiments_NeuralOperators.RegistryArtifacts
using experiments_NeuralOperators.Utils: raw_body
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
const SESSION_CANCEL_FLAGS = Dict{String,Threads.Atomic{Bool}}()
const SESSION_CHANNEL_CAPACITY = 1000

# CONSUMER (light task, from channel to webSocket)
# Killed when web task get killed or refreshed, new one created for the new WebSocket
# Keep track of the WebSocket sender tasks to ensure type-stability
const SENDER_TASKS = Dict{String,Task}()

# Replayable status and progress events for active sessions.
const SESSION_HISTORY = Dict{String,Vector{String}}()

# Global Thread-Safe Flag for Shutdown state
const IS_SHUTTING_DOWN = Threads.Atomic{Bool}(false)
const SHUTDOWN_EVENT = Threads.Event()

# Lock to edit the dictionaries
const STATE_LOCK = ReentrantLock()

# Track the WS connection to shutdown them
const ACTIVE_WS = Set{HTTP.WebSockets.WebSocket}()


# CORS Middleware
# Required during development because Vite runs on port 5173
# and Julia runs on port 8080. This allows them to communicate.
const ALLOWED_ORIGINS = Set([
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://localhost:5173"
])

const ALLOWED_HOSTS = Set([
    "127.0.0.1:8080",
    "localhost:8080",
    "127.0.0.1:5173",
    "localhost:5173"
])

function security_and_cors_middleware(handler)
    return function (req::HTTP.Request)
        # Protection anti-DNS Rebinding: always validate the Host header
        host_hdr = lowercase(HTTP.header(req, "Host", ""))
        if !(host_hdr in ALLOWED_HOSTS)
            return HTTP.Response(403, ["Content-Type" => "application/json"],
                JSON3.write(Dict("status" => "error", "message" => "Forbidden Host header.")))
        end

        origin = HTTP.header(req, "Origin", "")

        # Blocks every request Cross-Origin from external websites
        if !isempty(origin) && !(origin in ALLOWED_ORIGINS)
            return HTTP.Response(403, ["Content-Type" => "application/json"],
                JSON3.write(Dict("status" => "error", "message" => "Cross-origin request forbidden.")))
        end

        # For POST requests (mutate), requires that Content-Type is application/json
        # (Forces the browser to do the preflight CORS)
        if req.method == "POST"
            ct = lowercase(HTTP.header(req, "Content-Type", ""))
            if !startswith(ct, "application/json")
                return HTTP.Response(415, ["Content-Type" => "application/json"],
                    JSON3.write(Dict("status" => "error", "message" => "Content-Type must be application/json.")))
            end
        end

        if req.method == "OPTIONS"
            resp_headers = [
                "Access-Control-Allow-Methods" => "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers" => "Content-Type",
                "Vary" => "Origin"
            ]
            if origin in ALLOWED_ORIGINS
                push!(resp_headers, "Access-Control-Allow-Origin" => origin)
            end
            return HTTP.Response(204, resp_headers)
        end

        response = handler(req)
        if origin in ALLOWED_ORIGINS
            HTTP.setheader(response, "Access-Control-Allow-Origin" => origin)
            HTTP.setheader(response, "Vary" => "Origin")
        end
        HTTP.setheader(response, "X-Content-Type-Options" => "nosniff")
        HTTP.setheader(response, "X-Frame-Options" => "DENY")
        return response
    end
end

# Helper function to build Julia structs from JSON payload
function build_configs(payload)
    # Construct FEMConfig (using dictionary unpacking)
    fem_config = FEMConfig(; Dict(Symbol(k) => v for (k, v) in pairs(payload["fem_config"]))...)

    # Construct EvalConfig (using dictionary unpacking)
    eval_config = EvalConfig(; Dict(Symbol(k) => v for (k, v) in pairs(payload["eval_config"]))...)

    # ANTI-DoS checks (Bounds checking)
    (0.0 <= fem_config.beta_start <= 10.0 && 0.0 <= fem_config.beta_end <= 10.0) ||
        error("beta bounds out of range [0, 10].")
    fem_config.beta_step > 0.0 || error("beta_step must be positive.")

    num_betas = floor(Int, (fem_config.beta_end - fem_config.beta_start) / fem_config.beta_step) + 1
    (1 <= num_betas <= 200) ||
        error("Parameter space (beta) exceeds maximum allowed snapshots (max 200, requested $num_betas).")

    (1 <= fem_config.order <= 5) || error("FEM order must be between 1 and 5.")
    (10 <= fem_config.nx <= 10_000) || error("nx must be between 10 and 10,000.")
    (0.0 < fem_config.L <= 100.0) || error("L must be in (0, 100].")

    (fem_config.dt > 0.0 && fem_config.tf > fem_config.t0) || error("Invalid time domain parameters.")
    num_tsteps = floor(Int, (fem_config.tf - fem_config.t0) / fem_config.dt)
    (1 <= num_tsteps <= 5_000) ||
        error("Temporal grid exceeds maximum allowed steps (max 5,000, requested $num_tsteps).")

    solver_data = payload["solver"]
    epochs = Int(solver_data["epochs"])
    (1 <= epochs <= 100_000) || error("epochs must be between 1 and 100,000.")

    # Construct LR Scheduler
    sched_data = payload["scheduler"]
    local scheduler::AbstractLRScheduler

    if sched_data["type"] == "CosineAnnealing"
        scheduler = CosineAnnealing(
            lr_max=Float32(sched_data["ca_lr_max"]),
            lr_min=Float32(sched_data["ca_lr_min"]),
            max_epochs=Int(epochs)
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
    local solver::AbstractNeuralSolver

    batch_size = Int(solver_data["batch_size"])
    raw_pm_hash = String(get(solver_data, "pretrained_model_hash", ""))
    pm_hash = isempty(raw_pm_hash) ? "" : validate_hash(raw_pm_hash)

    if solver_data["type"] == "DeepONet"
        solver = DeepONetSolver(
            epochs=Int(solver_data["epochs"]),
            batch_size=batch_size,
            step_x=Int(solver_data["step_x"]),
            step_t=Int(solver_data["step_t"]),
            m_sensors=Int(solver_data["m_sensors"]),
            p_latent=Int(solver_data["p_latent"]),
            hidden=Int(solver_data["hidden"]),
            lr_scheduler=scheduler,
            pretrained_model_hash=pm_hash
        )
    elseif solver_data["type"] == "FNO"
        parsed_hidden = Tuple(parse.(Int, split(solver_data["hidden_channels"], ",")))
        parsed_modes = Tuple(parse.(Int, split(solver_data["modes"], ",")))

        solver = FNOSolver(
            epochs=Int(solver_data["epochs"]),
            batch_size=batch_size,
            nx_red=Int(solver_data["nx_red"]),
            nt_red=Int(solver_data["nt_red"]),
            hidden_channels=parsed_hidden,
            modes=parsed_modes,
            lr_scheduler=scheduler,
            pretrained_model_hash=pm_hash
        )
    elseif solver_data["type"] == "NOMAD"
        solver = NOMADSolver(
            epochs=Int(solver_data["epochs"]),
            batch_size=batch_size,
            step_x=Int(solver_data["step_x"]),
            step_t=Int(solver_data["step_t"]),
            m_sensors=Int(solver_data["m_sensors"]),
            p_latent=Int(solver_data["p_latent"]),
            hidden=Int(solver_data["hidden"]),
            lr_scheduler=scheduler,
            pretrained_model_hash=pm_hash
        )
    else
        error("Unknown Solver Type: $(solver_data["type"])")
    end

    return fem_config, solver, eval_config
end

# Path validation and filesystem helpers are kept in a small, independently tested module.
validate_hash(value) = RegistryArtifacts.validate_hash(value)
validate_solver_dir(value) = RegistryArtifacts.validate_solver_dir(value)
safe_joinpath(base_dir::AbstractString, parts::AbstractString...) =
    RegistryArtifacts.safe_joinpath(base_dir, parts...)

# Safe helper to download only from the official Firebase bucket of the project
const ALLOWED_FIREBASE_BUCKET = "gridap-gsoc2026.firebasestorage.app"
const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024 # Safe limit: 500 MB
const CLOUD_PROXY_URL = "https://us-central1-gridap-gsoc2026.cloudfunctions.net/getEvaluationArtifact"

function safe_firebase_download(remote_object_path::String, local_dest::String)
    # Parse and validate the object name. The destination is always derived from
    # canonical hashes elsewhere; the caller cannot supply an arbitrary Storage URL.
    parts = split(remote_object_path, "/")
    length(parts) == 2 || error("Invalid remote object path format: $remote_object_path")
    category, filename = parts
    category in ("data", "models", "plots") || error("Unsupported Firebase artifact category: $category")
    expected_extension = category == "plots" ? ".json" : ".jld2"
    endswith(filename, expected_extension) || error("Invalid file extension for Firebase artifact category: $category")
    hash_val = validate_hash(first(split(filename, ".")))

    function persist_downloaded_bytes(bytes::AbstractVector{UInt8})
        body = category == "plots" ?
               RegistryArtifacts.decode_evaluation_json_bytes(bytes) : Vector{UInt8}(bytes)
        length(body) <= MAX_DOWNLOAD_BYTES || error("Downloaded artifact exceeds maximum allowed size.")
        mkpath(dirname(local_dest))
        write(local_dest, body)
        return nothing
    end

    # Priority 1: Service Account direct access. If IAM denies the request, fall
    # through to the Cloud Function rather than failing a clone with valid public data.
    if HAS_FIREBASE_ACCESS
        token = FirebaseREST.get_access_token()
        if !isnothing(token)
            encoded_path = HTTP.URIs.escapeuri(remote_object_path)
            direct_url = "https://storage.googleapis.com/storage/v1/b/$(ALLOWED_FIREBASE_BUCKET)/o/$(encoded_path)?alt=media"
            direct_response = try
                HTTP.get(
                    direct_url,
                    ["Authorization" => "Bearer $token"];
                    status_exception=false,
                    readtimeout=120,
                )
            catch error
                @warn "Direct Firebase Storage request failed; trying the read-only Cloud Function proxy." object=remote_object_path exception=(error, catch_backtrace())
                nothing
            end
            if !isnothing(direct_response) && direct_response.status == 200
                @info "Downloaded Firebase artifact directly using service-account credentials: $remote_object_path"
                persist_downloaded_bytes(raw_body(direct_response))
                return nothing
            elseif !isnothing(direct_response)
                @warn "Direct Firebase Storage access failed; trying the read-only Cloud Function proxy." object=remote_object_path status=direct_response.status
            end
        end
    end

    # Priority 2: Public clone mode. The proxy verifies that the hash is referenced
    # by a published Firestore document before returning a plot or signed URL.
    @info "Requesting short-lived artifact access from Cloud Proxy for [$remote_object_path]..."
    proxy_endpoint = "$(CLOUD_PROXY_URL)?category=$(category)&hash=$(hash_val)"
    proxy_response = HTTP.get(proxy_endpoint; status_exception=false, readtimeout=30)
    if proxy_response.status != 200
        detail = try
            JSON3.read(raw_body(proxy_response))["message"]
        catch
            "HTTP $(proxy_response.status)"
        end
        error("Cloud Proxy refused download request for $remote_object_path ($detail)")
    end

    if category == "plots"
        persist_downloaded_bytes(raw_body(proxy_response))
        return nothing
    end

    proxy_data = JSON3.read(raw_body(proxy_response))
    signed_url = String(proxy_data["signed_url"])
    @info "Downloading binary artifact to $local_dest..."
    response = HTTP.get(signed_url; redirect=false, status_exception=false, readtimeout=120)
    response.status == 200 || error("Signed Storage download failed with HTTP $(response.status) for $remote_object_path")
    persist_downloaded_bytes(raw_body(response))
    return nothing
end

# Updates the timestamp version of the catalog on Firestore
function bump_catalog_metadata!(token::String)
    timestamp_ms = round(Int64, datetime2unix(now(UTC)) * 1000)
    payload = Dict("updated_at" => timestamp_ms)

    success = FirebaseREST.push_to_firestore(token, "catalog_metadata", "state", payload)
    if success
        @info "Catalog metadata version bumped ($timestamp_ms)"
    else
        @warn "Failed to bump catalog metadata version."
    end
    return success
end

# Endpoint to verify the server is compiled and ready
@get "/api/ping" function (req::HTTP.Request)
    return JSON3.write(Dict("status" => "ok", "message" => "Julia Backend Ready"))
end

function start_session_sender(
    ws::HTTP.WebSockets.WebSocket,
    ch::Channel{String},
)
    return Threads.@spawn begin
        try
            for log_msg in ch
                HTTP.WebSockets.isclosed(ws) && break
                HTTP.WebSockets.send(ws, log_msg)
            end
        catch
            # The client may disconnect while messages are being sent.
        end
    end
end


# Simulation WebSocket -> endpoint before Oxygen serve()
function handle_simulation_websocket(ws::HTTP.WebSockets.WebSocket)
    local sender_task = nothing
    local session_channel = nothing

    # Reject connection if server is shutting down
    if IS_SHUTTING_DOWN[]
        HTTP.WebSockets.send(ws, JSON3.write(Dict("type" => "error", "message" => "Server is shutting down.")))
        return
    end
    local session_id = nothing

    # Registry the connection
    lock(STATE_LOCK) do
        push!(ACTIVE_WS, ws)
    end

    try
        for msg in ws
            payload = JSON3.read(msg)
            action = payload["action"]

            # START or RECONNECT logic
            if action == "reconnect"
                raw_session_id = get(payload, "session_id", nothing)
                session_id = isnothing(raw_session_id) ? nothing : String(raw_session_id)

                is_valid = lock(STATE_LOCK) do
                    !isnothing(session_id) &&
                        haskey(ACTIVE_TASKS, session_id) &&
                        !istaskdone(ACTIVE_TASKS[session_id]) &&
                        haskey(SESSION_CHANNELS, session_id) &&
                        haskey(SESSION_HISTORY, session_id)
                end

                if !is_valid
                    HTTP.WebSockets.send(ws, JSON3.write(Dict(
                        "type" => "error",
                        "message" => "Simulation session expired or server was restarted."
                    )))
                    return
                end

                # Detach the previous sender, if one still exists.
                old_sender = lock(STATE_LOCK) do
                    old = get(SENDER_TASKS, session_id, nothing)

                    if !isnothing(old) &&
                        get(SENDER_TASKS, session_id, nothing) === old
                        delete!(SENDER_TASKS, session_id)
                    end

                    old
                end

                if !isnothing(old_sender) && !istaskdone(old_sender)
                    try
                        Base.throwto(old_sender, InterruptException())
                        wait(old_sender)
                    catch
                        # The previous sender may already have terminated.
                    end
                end

                # Snapshot history and replace the live channel atomically.
                reconnect_state = lock(STATE_LOCK) do
                    task = get(ACTIVE_TASKS, session_id, nothing)

                    if isnothing(task) ||
                        istaskdone(task) ||
                        !haskey(SESSION_CHANNELS, session_id) ||
                        !haskey(SESSION_HISTORY, session_id)
                        nothing
                    else
                        history = copy(SESSION_HISTORY[session_id])

                        old_channel = SESSION_CHANNELS[session_id]
                        new_channel = Channel{String}(1000)
                        SESSION_CHANNELS[session_id] = new_channel

                        isopen(old_channel) && close(old_channel)

                        (history, new_channel)
                    end
                end

                if isnothing(reconnect_state)
                    HTTP.WebSockets.send(ws, JSON3.write(Dict(
                        "type" => "error",
                        "message" => "Simulation session expired or server was restarted."
                    )))
                    return
                end

                history, session_channel = reconnect_state

                HTTP.WebSockets.send(ws, JSON3.write(Dict(
                    "type" => "session_info",
                    "session_id" => session_id
                )))

                # Replay every previously recorded status/progress message in order.
                for event in history
                    HTTP.WebSockets.isclosed(ws) && return
                    HTTP.WebSockets.send(ws, event)
                end

                # Resume streaming messages produced after the history snapshot.
                sender_task = start_session_sender(ws, session_channel)

                lock(STATE_LOCK) do
                    SENDER_TASKS[session_id] = sender_task
                end

                @info "Successfully reconnected WebSocket for active session: $session_id"

            elseif action == "start"
                # Blocks concurrent requests
                already_running = lock(STATE_LOCK) do
                    !isempty(ACTIVE_TASKS)
                end

                if already_running
                    HTTP.WebSockets.send(ws, JSON3.write(Dict(
                        "type" => "error",
                        "message" => "Another simulation is currently running. Please wait for completion."
                    )))
                    continue
                end

                session_id = string(uuid4())
                @info "New simulation started. Session ID: $session_id"

                # Send the session ID back to the client immediately
                HTTP.WebSockets.send(ws, JSON3.write(Dict("type" => "session_info", "session_id" => session_id)))

                local cancel_flag::Threads.Atomic{Bool}

                # 1. Prepare session state and channel first
                lock(STATE_LOCK) do
                    for old_session in collect(keys(SESSION_HISTORY))
                        if !haskey(ACTIVE_TASKS, old_session) &&
                            !haskey(SENDER_TASKS, old_session)
                            delete!(SESSION_HISTORY, old_session)
                        end
                    end

                    SESSION_HISTORY[session_id] = String[]

                    session_channel = Channel{String}(SESSION_CHANNEL_CAPACITY)
                    SESSION_CHANNELS[session_id] = session_channel

                    cancel_flag = Threads.Atomic{Bool}(false)
                    SESSION_CANCEL_FLAGS[session_id] = cancel_flag
                end

                # 2. Start the Sender Task BEFORE spawning the producer
                sender_task = start_session_sender(ws, session_channel)
                lock(STATE_LOCK) do
                    SENDER_TASKS[session_id] = sender_task
                end

                # 3. Spawn Producer Task with log_cb defined OUTSIDE try/catch
                lock(STATE_LOCK) do
                    if !haskey(ACTIVE_TASKS, session_id)
                        t = Threads.@spawn begin
                            # Definito fuori dal try così è visibile anche nel catch!
                            log_cb = function (info)
                                serialized = JSON3.write(info)

                                ch = lock(STATE_LOCK) do
                                    history = get!(SESSION_HISTORY, session_id, String[])
                                    push!(history, serialized)

                                    get(SESSION_CHANNELS, session_id, nothing)
                                end

                                if !isnothing(ch) && isopen(ch)
                                    try
                                        if Base.n_avail(ch) >= SESSION_CHANNEL_CAPACITY && !isempty(ch)
                                            take!(ch)
                                        end
                                        put!(ch, serialized)
                                    catch err
                                        err isa InterruptException && rethrow()
                                        @debug "Unable to enqueue session event" exception=(err, catch_backtrace())
                                    end
                                end
                            end

                            try
                                log_cb(Dict("type" => "status", "stage" => "Configuration received..."))

                                fem_config, solver, eval_config = build_configs(payload["data"])

                                should_stop = () -> cancel_flag[]
                                data_hash, model_hash, eval_hash = run_pipeline(
                                    solver,
                                    fem_config,
                                    eval_config;
                                    log_cb=log_cb,
                                    should_stop=should_stop,
                                )

                                solver_name = get_solver_name(solver)
                                json_path = plotsdir(lowercase(solver_name), "eval_$(eval_hash).json")
                                isfile(json_path) || error("Evaluation JSON not found after generation: $json_path")
                                eval_data = JSON3.read(read(json_path, String), Dict{String,Any})
                                success_payload = Dict(
                                    "type" => "success",
                                    "data_hash" => data_hash,
                                    "model_hash" => model_hash,
                                    "eval_hash" => eval_hash,
                                    "eval_data" => eval_data
                                )
                                log_cb(success_payload)
                            catch e
                                if e isa InterruptException ||
                                    (e isa TaskFailedException &&
                                    occursin("InterruptException", string(e)))

                                    @info "Producer caught cancellation" session_id

                                    log_cb(Dict(
                                        "type" => "error",
                                        "message" => "Simulation interrupted by the user."
                                    ))
                                else
                                    @error "Simulation failed" exception=(e, catch_backtrace())

                                    log_cb(Dict(
                                        "type" => "error",
                                        "message" => sprint(showerror, e)
                                    ))
                                end
                            finally
                                @info "Cleaning up simulation session" session_id
                                ch_to_close = lock(STATE_LOCK) do
                                    delete!(ACTIVE_TASKS, session_id)
                                    delete!(SESSION_CANCEL_FLAGS, session_id)
                                    pop!(SESSION_CHANNELS, session_id, nothing)
                                end
                                if !isnothing(ch_to_close) && isopen(ch_to_close)
                                    # Wait max 2 sec that the sender_task empty the "success" message
                                    t_wait = time()
                                    while isready(ch_to_close) && (time() - t_wait) < 2.0
                                        sleep(0.02)
                                    end
                                    close(ch_to_close)
                                end
                                # Remove the history after 10sec in case of fast refreshes
                                @async begin
                                    sleep(10.0)
                                    lock(STATE_LOCK) do
                                        if !haskey(ACTIVE_TASKS, session_id)
                                            delete!(SESSION_HISTORY, session_id)
                                        end
                                    end
                                end
                            end
                        end
                        ACTIVE_TASKS[session_id] = t
                    end
                end

            elseif action == "stop"
                cancel_flag = lock(STATE_LOCK) do
                    get(SESSION_CANCEL_FLAGS, session_id, nothing)
                end

                if !isnothing(cancel_flag)
                    cancel_flag[] = true

                    @info "Cancellation requested for session: $session_id"
                else
                    @warn "No active cancellation flag for session: $session_id"
                end
            end
        end
    catch e
        if e isa InterruptException
            @info "WebSocket received Ctrl+C. Broadcasting shutdown event to all threads..."
            Threads.atomic_xchg!(IS_SHUTTING_DOWN, true)
            notify(SHUTDOWN_EVENT)

        elseif e isa EOFError || e isa Base.IOError
            @debug "WebSocket connection closed"

        else
            @error "WebSocket crash:" exception=(e, catch_backtrace())
        end
    finally
        local sender_to_stop = nothing

        lock(STATE_LOCK) do
            delete!(ACTIVE_WS, ws)

            # Clean up only the sender owned by this WebSocket.
            if !isnothing(session_id) &&
                !isnothing(sender_task) &&
                get(SENDER_TASKS, session_id, nothing) === sender_task

                delete!(SENDER_TASKS, session_id)
                sender_to_stop = sender_task
            end

            # Keep history while the simulation or another sender is still active.
            if !isnothing(session_id) &&
                !haskey(ACTIVE_TASKS, session_id) &&
                !haskey(SENDER_TASKS, session_id)

                delete!(SESSION_HISTORY, session_id)
            end
        end

        if !isnothing(sender_to_stop) && !istaskdone(sender_to_stop)
            try
                Base.throwto(sender_to_stop, InterruptException())
            catch
            end
        end

        @info "WebSocket disconnected for session: $(session_id !== nothing ? session_id : "unknown")"
    end
end

@post "/api/check_registry" function (req::HTTP.Request)
    try
        # Parse incoming JSON payload
        payload = JSON3.read(raw_body(req))

        # Build configs
        fem_config, solver, eval_config = build_configs(payload)
        solver_name = get_solver_name(solver)

        registry = HashRegistry.load_registry()

        # Check FEM Data Hash
        data_hash = HashRegistry.config_hash(fem_config)
        data_path = datadir("sims", "data_$(data_hash).jld2")
        data_exists = haskey(registry["data"], data_hash) && isfile(data_path)

        # Check Model Hash
        model_dict = Pipelines.model_config_for_hash(solver, data_hash)
        model_hash = HashRegistry.config_hash(model_dict)
        model_path = datadir(
            "models",
            lowercase(solver_name),
            "model_$(model_hash).jld2",
        )
        model_exists = haskey(registry["models"], model_hash) && isfile(model_path)

        # Check Eval Hash
        eval_dict = Pipelines.evaluation_config_for_hash(model_hash, eval_config)
        eval_hash = HashRegistry.config_hash(eval_dict)
        eval_path = plotsdir(
            lowercase(solver_name),
            "eval_$(eval_hash).json",
        )
        eval_exists = haskey(registry["evaluations"], eval_hash) && isfile(eval_path)

        return JSON3.write(Dict(
            "status" => "success",
            "data_exists" => data_exists,
            "model_exists" => model_exists,
            "eval_exists" => eval_exists,
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

# Endpoint to fetch the entire cache registry. `_isLocal` describes physical files,
# not merely entries present in registry.json.
@get "/api/registry" function (req::HTTP.Request)
    try
        registry = HashRegistry.load_registry()
        registry_with_presence = RegistryArtifacts.with_local_presence(
            registry;
            data_dir=datadir("sims"),
            models_dir=datadir("models"),
            plots_dir=plotsdir(),
        )
        return JSON3.write(Dict("status" => "success", "data" => registry_with_presence))
    catch e
        @error "Failed to load registry" exception=(e, catch_backtrace())
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e)))
        )
    end
end

# Endpoint to fetch a specific interactive evaluation JSON artifact.
# Resolve the solver directory from the local dependency graph first; the frontend hint
# is only a fallback for older/incomplete registry entries.
@post "/api/get_evaluation_plot" function (req::HTTP.Request)
    payload = try
        JSON3.read(raw_body(req), Dict{String,Any})
    catch e
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Invalid JSON request body: $(sprint(showerror, e))")),
        )
    end

    eval_hash = try
        validate_hash(get(payload, "eval_hash", nothing))
    catch e
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e))),
        )
    end

    solver_hint = get(payload, "solver_type", nothing)
    registry = try
        HashRegistry.load_registry()
    catch e
        @error "Failed to load registry while retrieving evaluation" exception=(e, catch_backtrace())
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Could not load the local registry.")),
        )
    end

    result = try
        RegistryArtifacts.read_evaluation_json(
            eval_hash,
            registry,
            plotsdir();
            solver_hint=solver_hint,
        )
    catch e
        @error "Invalid evaluation lookup request" eval_hash exception=(e, catch_backtrace())
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e))),
        )
    end

    if result.status == :not_found
        @warn "Evaluation JSON not found" eval_hash searched_paths=result.searched_paths
        return HTTP.Response(
            404,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => result.message,
                "searched_paths" => result.searched_paths,
            )),
        )
    elseif result.status == :invalid_json
        @error "Evaluation JSON is invalid" eval_hash path=result.path message=result.message
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => result.message)),
        )
    end

    @info "Serving evaluation JSON" eval_hash path=result.path
    return HTTP.Response(
        200,
        ["Content-Type" => "application/json"],
        JSON3.write(Dict("status" => "success", "eval_data" => result.data)),
    )
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
        payload = JSON3.read(raw_body(req), Dict{String,Any})
    catch e
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Invalid JSON payload."))
        )
    end

    eval_hash = validate_hash(get(payload, "eval_hash", ""))
    @info "User triggered Firebase sharing for experiment: $eval_hash"

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
            JSON3.write(Dict("status" => "error", "message" => "Evaluation hash not found in local registry."))
        )
    end

    # Reconstruct the full computational graph from the registry
    eval_data = registry["evaluations"][eval_hash]
    model_hash = validate_hash(eval_data["model_hash"])
    model_data = registry["models"][model_hash]
    data_hash = validate_hash(model_data["data_hash"])
    data_config = registry["data"][data_hash]

    solver_type = validate_solver_dir(model_data["solver_type"])

    # Only interactive JSON evaluations can be shared. Resolve current and legacy
    # solver folder names so older artifacts remain publishable.
    eval_file_path = RegistryArtifacts.find_existing_solver_artifact(
        plotsdir(), solver_type, "eval_$(eval_hash).json",
    )
    data_path = safe_joinpath(datadir("sims"), "data_$(data_hash).jld2")
    model_path = RegistryArtifacts.find_existing_solver_artifact(
        datadir("models"), solver_type, "model_$(model_hash).jld2",
    )

    if isnothing(eval_file_path) || !isfile(data_path) || isnothing(model_path)
        return HTTP.Response(404, ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => "Some required files (evaluation, data, or model) are missing from disk."
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
        cred = Auth.get_firebase_credentials()
        project_id = cred["project_id"]
        bucket_name = "$(project_id).firebasestorage.app"
        reconstructed_url = "https://firebasestorage.googleapis.com/v0/b/$(bucket_name)/o/plots%2F$(eval_hash).json?alt=media"

        return JSON3.write(Dict(
            "status" => "success",
            "message" => "Experiment is already published in the gallery!",
            "public_url" => reconstructed_url,
            "already_exists" => true
        ))
    end

    uploaded_objects = String[]
    rollback_uploads!() = foreach(path -> FirebaseREST.delete_from_storage(token, path), uploaded_objects)

    @info "Uploading evaluation JSON artifact..."
    artifact_url = FirebaseREST.upload_to_storage(token, eval_file_path, "plots/$(eval_hash).json"; content_type="application/json")
    isnothing(artifact_url) || push!(uploaded_objects, "plots/$(eval_hash).json")

    @info "Uploading high-fidelity FEM data..."
    data_url = FirebaseREST.upload_to_storage(token, data_path, "data/$(data_hash).jld2")
    isnothing(data_url) || push!(uploaded_objects, "data/$(data_hash).jld2")

    @info "Uploading Neural Operator weights..."
    model_url = FirebaseREST.upload_to_storage(token, model_path, "models/$(model_hash).jld2")
    isnothing(model_url) || push!(uploaded_objects, "models/$(model_hash).jld2")

    if isnothing(artifact_url) || isnothing(data_url) || isnothing(model_url)
        rollback_uploads!()
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => "Failed to upload one or more files to Cloud Storage; partial uploads were rolled back where possible."
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
        "benchmark_version" => eval_data["benchmark_version"],
        "eval_url" => artifact_url,
        "data_url" => data_url,
        "model_url" => model_url
    )

    success = FirebaseREST.push_to_firestore(token, "shared_experiments", eval_hash, doc_payload)

    if success
        # Invalidate the cache of the Cloud Functions updating the timestamp in metadata document
        bump_catalog_metadata!(token)

        @info "Publishing completed successfully for $eval_hash."
        return JSON3.write(Dict(
            "status" => "success",
            "message" => "Experiment published successfully to the global gallery!",
            "public_url" => artifact_url,
            "already_exists" => false
        ))
    else
        rollback_uploads!()
        return HTTP.Response(
            500,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Failed to push structured metadata to Firestore; uploaded artifacts were rolled back where possible."))
        )
    end
end

# Sync simulation endpoint: download required artifacts and commit metadata only after
# every requested file is present and non-empty. No service-account file is required:
# safe_firebase_download falls back to the read-only Cloud Function proxy.
@post "/api/sync_experiment" function (req::HTTP.Request)
    payload = try
        JSON3.read(raw_body(req), Dict{String,Any})
    catch e
        return HTTP.Response(400, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Invalid JSON payload: $(sprint(showerror, e))")))
    end

    hashes = get(payload, "hashes", Dict{String,Any}())
    hashes isa AbstractDict || return HTTP.Response(400, ["Content-Type" => "application/json"],
        JSON3.write(Dict("status" => "error", "message" => "'hashes' must be a JSON object.")))

    data_hash, model_hash, eval_hash = try
        raw_data = get(hashes, "data_hash", nothing)
        raw_model = get(hashes, "model_hash", nothing)
        raw_eval = get(payload, "eval_hash", nothing)
        (
            isnothing(raw_data) ? nothing : validate_hash(raw_data),
            isnothing(raw_model) ? nothing : validate_hash(raw_model),
            isnothing(raw_eval) ? nothing : validate_hash(raw_eval),
        )
    catch e
        return HTTP.Response(400, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e))))
    end

    if isnothing(data_hash) && isnothing(model_hash) && isnothing(eval_hash)
        return HTTP.Response(400, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "No hashes provided. Nothing to sync.")))
    end

    registry = try
        HashRegistry.load_registry()
    catch e
        @error "Could not load local registry before sync" exception=(e, catch_backtrace())
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Could not load local registry.")))
    end

    # Keep UI/cloud-only fields out of the persistent local registry.
    function clean_config(value)
        value isa AbstractDict || throw(ArgumentError("Configuration metadata must be a JSON object."))
        forbidden = Set((
            "_isShared", "_isLocal", "model_url", "data_url", "eval_url",
            "data_hash", "model_hash", "eval_hash", "solver_type", "model_type", "download_url",
        ))
        return Dict{String,Any}(
            string(key) => item for (key, item) in pairs(value)
                                    if !(string(key) in forbidden)
        )
    end

    try
        model_type_raw = String(get(payload, "model_type", ""))
        solver_dir = isempty(strip(model_type_raw)) ? "" : validate_solver_dir(model_type_raw)

        # Resolve missing dependency hashes from the local registry when a caller
        # requests only a model/evaluation node.
        if isnothing(model_hash) && !isnothing(eval_hash)
            eval_entry = get(registry["evaluations"], eval_hash, nothing)
            eval_entry isa AbstractDict || error("Evaluation [$eval_hash] is not registered locally; sync it from a shared registry payload.")
            model_hash = validate_hash(get(eval_entry, "model_hash", nothing))
        end
        if isnothing(data_hash) && !isnothing(model_hash)
            model_entry = get(registry["models"], model_hash, nothing)
            if model_entry isa AbstractDict
                raw_parent_data = get(model_entry, "data_hash", nothing)
                if !isnothing(raw_parent_data) && !isempty(String(raw_parent_data))
                    data_hash = validate_hash(raw_parent_data)
                end
            end
        end

        # Dataset: download by its canonical object name, not by a client-provided URL.
        if !isnothing(data_hash)
            data_config = get(payload, "fem_config", get(registry["data"], data_hash, nothing))
            data_config isa AbstractDict || error("FEM configuration metadata is missing for dataset [$data_hash].")
            data_dest = safe_joinpath(datadir("sims"), "data_$(data_hash).jld2")
            RegistryArtifacts.ensure_artifact!(data_dest, path ->
                safe_firebase_download("data/$(data_hash).jld2", path)
            )
            registry["data"][data_hash] = clean_config(data_config)
        end

        # Model weights: require metadata and a known solver directory.
        if !isnothing(model_hash)
            if isempty(solver_dir)
                model_entry = get(registry["models"], model_hash, nothing)
                if model_entry isa AbstractDict
                    model_type_raw = String(get(model_entry, "solver_type", ""))
                    solver_dir = validate_solver_dir(model_type_raw)
                end
            end
            isempty(solver_dir) && error("Model type is missing; cannot determine the model directory.")

            solver_config = get(payload, "solver_config", get(get(registry["models"], model_hash, Dict{String,Any}()), "solver", nothing))
            solver_config isa AbstractDict || error("Solver configuration metadata is missing for model [$model_hash].")
            model_dest = safe_joinpath(datadir("models"), solver_dir, "model_$(model_hash).jld2")
            RegistryArtifacts.ensure_artifact!(model_dest, path ->
                safe_firebase_download("models/$(model_hash).jld2", path)
            )

            parent_data_hash = isnothing(data_hash) ? "" : data_hash
            registry["models"][model_hash] = Dict(
                "solver_type" => model_type_raw,
                "solver" => clean_config(solver_config),
                "data_hash" => parent_data_hash,
            )
        end

        # Evaluation JSON: the proxy is addressed by its hash, so eval_url is metadata,
        # not a prerequisite for syncing. This also works without firebase-auth.json.
        if !isnothing(eval_hash)
            isempty(solver_dir) && error("Model type is missing; cannot determine the evaluation directory.")
            isnothing(model_hash) && error("Model hash is missing for evaluation [$eval_hash].")
            eval_config = get(payload, "eval_config", get(get(registry["evaluations"], eval_hash, Dict{String,Any}()), "eval_config", nothing))
            eval_config isa AbstractDict || error("Evaluation configuration metadata is missing for evaluation [$eval_hash].")

            eval_dest = safe_joinpath(plotsdir(), solver_dir, "eval_$(eval_hash).json")
            RegistryArtifacts.ensure_artifact!(
                eval_dest,
                path -> safe_firebase_download("plots/$(eval_hash).json", path);
                validator=RegistryArtifacts.is_valid_evaluation_json,
            )

            benchmark_version = get(payload, "benchmark_version", get(get(registry["evaluations"], eval_hash, Dict{String,Any}()), "benchmark_version", nothing))
            isnothing(benchmark_version) && error("Evaluation benchmark_version metadata is missing.")
            registry["evaluations"][eval_hash] = Dict(
                "model_hash" => model_hash,
                "eval_config" => clean_config(eval_config),
                "benchmark_version" => benchmark_version,
            )
        end

        HashRegistry.save_registry(registry)
        @info "Registry successfully updated after artifact verification." data_hash model_hash eval_hash
        return JSON3.write(Dict(
            "status" => "success",
            "message" => "Requested artifacts verified and synced to the local workspace.",
        ))
    catch e
        @error "Experiment sync failed; registry was not committed" exception=(e, catch_backtrace())
        return HTTP.Response(502, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => sprint(showerror, e))))
    end
end

# Delete endpoint (Local & Cloud)
@post "/api/delete_local" function (req::HTTP.Request)
    payload = JSON3.read(raw_body(req), Dict{String,Any})
    target_hash = validate_hash(payload["hash"])
    target_type = payload["type"] # "evaluation", "model", or "data"

    registry = HashRegistry.load_registry()

    evals_to_delete = String[]
    models_to_delete = String[]
    data_to_delete = String[]

    # Cascading Logic Selection
    if target_type == "evaluation"
        push!(evals_to_delete, target_hash)
    elseif target_type == "model"
        push!(models_to_delete, target_hash)
        for (e_h, e_obj) in registry["evaluations"]
            if e_obj["model_hash"] == target_hash
                push!(evals_to_delete, e_h)
            end
        end
    elseif target_type == "data"
        push!(data_to_delete, target_hash)
        for (m_h, m_obj) in registry["models"]
            if m_obj["data_hash"] == target_hash
                push!(models_to_delete, m_h)
                for (e_h, e_obj) in registry["evaluations"]
                    if e_obj["model_hash"] == m_h
                        push!(evals_to_delete, e_h)
                    end
                end
            end
        end
    else
        return HTTP.Response(400, "Invalid target_type.")
    end

    @info "Executing cascading delete for $target_type [$target_hash]..."

    # Delete Evaluations
    for e_h in evals_to_delete
        haskey(registry["evaluations"], e_h) || continue
        m_h = validate_hash(registry["evaluations"][e_h]["model_hash"])
        solver_type = validate_solver_dir(registry["models"][m_h]["solver_type"])
        for solver_dir in RegistryArtifacts.solver_dir_candidates(solver_type)
            json_path = safe_joinpath(plotsdir(), solver_dir, "eval_$(validate_hash(e_h)).json")
            isfile(json_path) && rm(json_path)
        end
        delete!(registry["evaluations"], e_h)
    end

    # Delete Models (Weights)
    for m_h in models_to_delete
        haskey(registry["models"], m_h) || continue
        solver_type = validate_solver_dir(registry["models"][m_h]["solver_type"])
        for solver_dir in RegistryArtifacts.solver_dir_candidates(solver_type)
            model_path = safe_joinpath(datadir("models"), solver_dir, "model_$(validate_hash(m_h)).jld2")
            isfile(model_path) && rm(model_path)
        end
        delete!(registry["models"], m_h)
    end

    # Delete Data (FEM Snapshots)
    for d_h in data_to_delete
        data_path = safe_joinpath(datadir("sims"), "data_$(validate_hash(d_h)).jld2")
        isfile(data_path) && rm(data_path)
        delete!(registry["data"], d_h)
    end

    # Save registry
    HashRegistry.save_registry(registry)
    @info "Deletion completed successfully."

    return JSON3.write(Dict("status" => "success", "message" => "Item(s) successfully deleted from local workspace."))
end


@post "/api/delete_shared" function (req::HTTP.Request)
    if !HAS_FIREBASE_ACCESS
        return HTTP.Response(403, JSON3.write(Dict("status" => "error", "message" => "Firebase publishing is disabled.")))
    end

    payload = JSON3.read(raw_body(req), Dict{String,Any})
    raw_eval_hash = get(payload, "eval_hash", nothing)
    eval_hash = try
        validate_hash(raw_eval_hash)
    catch
        return HTTP.Response(400, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Invalid or missing eval_hash.")))
    end

    token = FirebaseREST.get_access_token()
    isnothing(token) && return HTTP.Response(500, ["Content-Type" => "application/json"],
        JSON3.write(Dict("status" => "error", "message" => "Failed to authenticate with Firebase.")))

    cred = Auth.get_firebase_credentials()
    base_url = "https://firestore.googleapis.com/v1/projects/$(cred["project_id"])/databases/(default)/documents/shared_experiments"
    doc_url = "$(base_url)/$(HTTP.URIs.escapeuri(eval_hash))"

    # Check that the document existsand read the hash from the Firestore document
    get_resp = HTTP.get(doc_url, ["Authorization" => "Bearer $token"]; status_exception=false)
    if get_resp.status != 200
        return HTTP.Response(404, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Shared experiment not found in Firestore.")))
    end

    doc_json = JSON3.read(String(raw_body(get_resp)))
    hashes_fields = doc_json[:fields][:hashes][:mapValue][:fields]
    model_hash = validate_hash(String(hashes_fields[:model_hash][:stringValue]))
    data_hash = validate_hash(String(hashes_fields[:data_hash][:stringValue]))

    @info "Deleting experiment $eval_hash from Cloud Gallery..."

    # Delete the Firestore document first. Never remove the plot while a public
    # document still references it.
    doc_deleted = FirebaseREST.delete_from_firestore(token, "shared_experiments", eval_hash)

    if !doc_deleted
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Failed to delete the Firestore document; Storage artifacts were left untouched.")))
    end

    plot_deleted = FirebaseREST.delete_from_storage(token, "plots/$(eval_hash).json")
    if !plot_deleted
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "The Firestore entry was removed, but its evaluation JSON remains in Storage.")))
    end

    # Garbage collection is safe only after reading the complete collection.
    resp = HTTP.get(base_url, ["Authorization" => "Bearer $token"]; status_exception=false)
    if resp.status != 200
        @warn "Shared document was removed, but Storage garbage collection could not inspect the gallery." status=resp.status
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "The experiment was removed, but shared asset garbage collection could not verify remaining references.")))
    end

    parsed_page = JSON3.read(String(raw_body(resp)))
    if haskey(parsed_page, :nextPageToken)
        @warn "Firestore collection has multiple pages; skipping automatic storage GC to prevent accidental deletion."
        return JSON3.write(Dict("status" => "success", "message" => "Experiment removed. Shared data/model files were retained because the gallery spans multiple pages."))
    end

    docs = get(parsed_page, :documents, [])
    referenced_models = Set{String}()
    referenced_data = Set{String}()
    for d in docs
        try
            hf = d[:fields][:hashes][:mapValue][:fields]
            push!(referenced_models, String(hf[:model_hash][:stringValue]))
            push!(referenced_data, String(hf[:data_hash][:stringValue]))
        catch e
            @warn "Skipping a malformed shared document during storage GC; referenced assets will be retained." exception=(e, catch_backtrace())
        end
    end

    gc_failures = String[]
    if !(model_hash in referenced_models)
        FirebaseREST.delete_from_storage(token, "models/$(model_hash).jld2") || push!(gc_failures, "models/$(model_hash).jld2")
    end
    if !(data_hash in referenced_data)
        FirebaseREST.delete_from_storage(token, "data/$(data_hash).jld2") || push!(gc_failures, "data/$(data_hash).jld2")
    end

    if !isempty(gc_failures)
        @warn "Experiment removed, but some unreferenced Storage objects could not be deleted." gc_failures
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            JSON3.write(Dict("status" => "error", "message" => "Experiment removed, but garbage collection failed for: $(join(gc_failures, ", ")).")))
    end

    @info "Successfully removed $eval_hash from public gallery and collected unreferenced assets."

    # Invalidate the cache of the Cloud Functions updating the timestamp in metadata document
    bump_catalog_metadata!(token)

    return JSON3.write(Dict("status" => "success", "message" => "Experiment and unreferenced files deleted successfully."))
end

# Define the path to the React static build
const BUILD_DIR = joinpath(@__DIR__, "..", "dashboard", "dist")
const REPO_BASE = "/Gridap-NeuralOperators-GSoC2026"

# Serve the static dashboard if the build directory exists
if isdir(BUILD_DIR)
    @info "Serving static React dashboard from: $BUILD_DIR"
    @info "Base URL path matched to GitHub Pages: $REPO_BASE"

    # Mount the entire dist folder to the GitHub Pages base route
    staticfiles(BUILD_DIR, REPO_BASE)

    # Redirect root requests (localhost:8080/) directly to the dashboard
    @get "/" function (req::HTTP.Request)
        return HTTP.Response(302, ["Location" => "$REPO_BASE/index.html"])
    end

    # Catch-all route for SPA client-side routing. but the architecture is ready also for React Router.
    @get "$REPO_BASE/*" function (req::HTTP.Request)
        index_path = joinpath(BUILD_DIR, "index.html")
        if isfile(index_path)
            return HTTP.Response(200, ["Content-Type" => "text/html"], read(index_path))
        else
            return HTTP.Response(404, "index.html not found in build directory.")
        end
    end
else
    @warn "Dashboard build directory not found at $BUILD_DIR. Please run 'npm run build' inside the 'dashboard' folder."
end

# Start the Server
println("\n===================================================================")
println("🚀 GridapROMs API Server is running!")
println("📡 Listening for React Dashboard on: http://127.0.0.1:8080")
println("🔌 WebSocket Engine on: ws://127.0.0.1:8080/ws/simulate")
println("===================================================================\n")

# Disable the low-level C hard-crash on Ctrl+C.
# This forces Julia to throw a catchable InterruptException instead.
Base.exit_on_sigint(false)

function dashboard_stream_handler(middleware::Function)

    # Standard Oxygen HTTP handler:
    # Normal requests pass through this
    http_handler = Oxygen.Core.stream_handler(middleware)

    return function (stream::HTTP.Stream)

        req = stream.message
        request_path = first(split(req.target, '?'; limit=2))

        # Other requests are handled normally by Oxygen
        if request_path != "/ws/simulate"
            return http_handler(stream)
        end

        # If someone asks for this endpoint without the upgrade to WebSocket,
        # returns a normal HTTP response.
        if !HTTP.WebSockets.isupgrade(req)
            HTTP.setstatus(stream, 426)
            HTTP.setheader(stream, "Content-Type" => "application/json")
            HTTP.startwrite(stream)

            write(stream, JSON3.write(Dict(
                "status" => "error",
                "message" => "WebSocket upgrade required."
            )))

            HTTP.closewrite(stream)
            return nothing
        end

        # Check the Host and the Origin before the upgrade.
        host_hdr = lowercase(HTTP.header(req, "Host", ""))
        origin_hdr = HTTP.header(req, "Origin", "")

        allowed = host_hdr in ALLOWED_HOSTS &&
            (isempty(origin_hdr) || origin_hdr in ALLOWED_ORIGINS)

        if !allowed
            HTTP.setstatus(stream, 403)
            HTTP.setheader(stream, "Content-Type" => "application/json")
            HTTP.startwrite(stream)

            write(stream, JSON3.write(Dict(
                "status" => "error",
                "message" => "Forbidden WebSocket origin or host."
            )))

            HTTP.closewrite(stream)
            return nothing
        end

        # Direct upgrade: the WebSocket doesn't pass through
        # the normal Oxygen middleware of HTTP deserialization.
        HTTP.WebSockets.upgrade(stream) do ws
            handle_simulation_websocket(ws)
        end

        return nothing
    end
end


const SERVER_HOST = get(ENV, "JULIA_SERVER_HOST", "127.0.0.1")
const SERVER_PORT = parse(Int, get(ENV, "JULIA_SERVER_PORT", "8080"))

# Attach the CORS middleware and start serving
serve(
    handler=dashboard_stream_handler,
    host=SERVER_HOST,
    port=SERVER_PORT,
    middleware=[security_and_cors_middleware],
    access_log=nothing,
    async=true,
    show_banner=false
)

try
    while !IS_SHUTTING_DOWN[]
        sleep(0.1)
    end
catch e
    if e isa InterruptException
        @info "Main thread caught Ctrl+C. Triggering graceful shutdown..."
        Threads.atomic_xchg!(IS_SHUTTING_DOWN, true)
    else
        @error "Fatal server error:" exception=(e, catch_backtrace())
        exit(1)
    end
end

# ===================================================================
# GRACEFUL TEARDOWN SEQUENCE
# ===================================================================
println("\n")
@info "🛑 Shutdown sequence initiated..."

# Activate system signals again (second Ctrl+C kill the process immediately)
Base.exit_on_sigint(true)

# Collect the server state snapshot (thread-safe)
active_ws_list, active_sims, active_senders, channels = lock(STATE_LOCK) do
    (
        collect(ACTIVE_WS),
        collect(values(ACTIVE_TASKS)),
        collect(values(SENDER_TASKS)),
        collect(values(SESSION_CHANNELS))
    )
end

# Notify the frontend and close the WebSockets
if !isempty(active_ws_list)
    @info "Notifying $(length(active_ws_list)) active WebSocket clients of impending shutdown..."

    # Payload for the frontend
    shutdown_msg = JSON3.write(Dict(
        "type" => "error",
        "message" => "Server disconnected for restart or maintenance."
    ))

    for ws in active_ws_list
        try
            # Notify the frontend
            HTTP.WebSockets.send(ws, shutdown_msg)

            # Give the TCP a small time to flush the package before closing the connection
            sleep(0.05)
            close(ws)
        catch
            # Ignore errors if the client is disconnected
        end
    end
end

# Interrupt the simulations and the threads
if !isempty(channels)
    @info "Closing message queues..."
    for ch in channels
        try
            close(ch)
        catch
        end
    end
end

if !isempty(active_senders)
    for task in active_senders
        if !istaskdone(task)
            @async try
                Base.throwto(task, InterruptException())
            catch
            end
        end
    end
end

if !isempty(active_sims)
    @info "Sending interrupt to active simulations..."
    for task in active_sims
        if !istaskdone(task)
            @async try
                Base.throwto(task, InterruptException())
            catch
            end
        end
    end
end

# Close
@info "✅ Clean shutdown complete. Releasing OS ports..."
exit(0)
