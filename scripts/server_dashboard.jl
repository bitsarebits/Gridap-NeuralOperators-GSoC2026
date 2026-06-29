using DrWatson

@quickactivate :experiments_NeuralOperators

using Oxygen
using HTTP
using JSON3

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
include("run_all_models.jl")


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

# Static File Server
# Exposes the DrWatson plots directory to the web.
# When React asks for http://localhost:8080/plots/hash.png, Julia serves it.
mkpath(plotsdir())

# Serve the plots directory using DrWatson's built-in macro
staticfiles(plotsdir(), "/plots")

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

# API Endpoint
# Receives the configuration JSON from React, maps it to Julia structs,
# and launches the training pipeline.
@post "/api/run_model" function (req::HTTP.Request)

    try
        # Parse incoming JSON payload
        payload = JSON3.read(req.body)

        println(">>> Received new simulation request from Dashboard <<<")

        # Build configs
        fem_config, solver, eval_config = build_configs(payload)

        # Execute the Pipeline
        data_hash, model_hash, eval_hash = run_pipeline(solver, fem_config, eval_config)

        solver_name = get_solver_name(solver)

        image_url = "/plots/$(lowercase(solver_name))/eval_$(eval_hash).png"

        println(">>> Simulation completed. Sending hashes to Dashboard <<<")

        # Return the response to the dashboard
        return JSON3.write(Dict(
            "status" => "success",
            "data_hash" => data_hash,
            "model_hash" => model_hash,
            "eval_hash" => eval_hash,
            "image_url" => image_url
        ))

    catch e
        @error "Simulation failed" exception=(e, catch_backtrace())

        # Returns structured JSON
        return HTTP.Response(
            400,
            ["Content-Type" => "application/json"],
            JSON3.write(Dict(
                "status" => "error",
                "message" => sprint(showerror, e)
            )))
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
println("===================================================================\n")

# Attach the CORS middleware and start serving
serve(host="127.0.0.1", port=8080, middleware=[cors_middleware])
