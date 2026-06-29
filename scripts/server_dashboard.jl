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

# Global dictionary to track the active simulations status (cancelled)
const ACTIVE_TASKS = Dict{String,Task}()

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
    # Generate unique ID for the connection/simulation
    session_id = string(uuid4())

    try
        for msg in ws
            payload = JSON3.read(msg)

            if payload["action"] == "start"
                # Start the pipeline in a new thread to keep the WebSocket working
                t = Threads.@spawn begin
                    try
                        # Callback function to send logs to the frontend
                        log_cb = (info) -> HTTP.WebSockets.send(ws, JSON3.write(info))

                        log_cb(Dict("type" => "status", "stage" => "Configuration received..."))

                        fem_config, solver, eval_config = build_configs(payload["data"])

                        # Pass the callback and the cancellation flagto the pipeline
                        data_hash, model_hash, eval_hash = run_pipeline(
                            solver, fem_config, eval_config;
                            log_cb=log_cb
                        )

                        solver_name = get_solver_name(solver)
                        image_path = plotsdir(lowercase(solver_name), "eval_$(eval_hash).png")

                        # Read the image bytes and encode to Base64 Data URI
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
                        # Check if the error is the manual interruption
                        if e isa InterruptException
                            HTTP.WebSockets.send(ws, JSON3.write(Dict("type" => "error", "message" => "Simulation interrupted by the user.")))
                        else
                            @error "Simulation failed" exception=(e, catch_backtrace())
                            HTTP.WebSockets.send(ws, JSON3.write(Dict("type" => "error", "message" => sprint(showerror, e))))
                        end
                    finally
                        # Clean up the task registry when done or failed
                        delete!(ACTIVE_TASKS, session_id)
                    end
                end

                # Register the task so we can kill it later
                ACTIVE_TASKS[session_id] = t

            elseif payload["action"] == "stop"
                if haskey(ACTIVE_TASKS, session_id)
                    println(">>> User requested abort for session: $session_id <<<")
                    # Inject InterruptException into the running Task
                    schedule(ACTIVE_TASKS[session_id], InterruptException(), error=true)
                end
            end
        end
    finally
        # If the user closes the browser/tab, kill the task to free up resources
        if haskey(ACTIVE_TASKS, session_id)
            schedule(ACTIVE_TASKS[session_id], InterruptException(), error=true)
            delete!(ACTIVE_TASKS, session_id)
        end
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

# Start the Server
println("\n===================================================================")
println("🚀 GridapROMs API Server is running!")
println("📡 Listening for React Dashboard on: http://127.0.0.1:8080")
println("🔌 WebSocket Engine on: ws://127.0.0.1:8080/ws/simulate")
println("===================================================================\n")

# Attach the CORS middleware and start serving
serve(host="127.0.0.1", port=8080, middleware=[cors_middleware])
