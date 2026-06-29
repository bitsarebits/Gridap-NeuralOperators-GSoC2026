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

# API Endpoint
# Receives the configuration JSON from React, maps it to Julia structs,
# and launches the training pipeline.
@post "/api/run_model" function (req::HTTP.Request)
    # Parse incoming JSON payload
    payload = JSON3.read(req.body)

    println(">>> Received new simulation request from Dashboard <<<")

    # Construct FEMConfig
    fem_dict = Dict{Symbol,Any}(Symbol(k) => v for (k, v) in payload["fem_config"])
    fem_config = FEMConfig(; fem_dict...)

    # Construct EvalConfig
    eval_dict = Dict{Symbol,Any}(Symbol(k) => v for (k, v) in payload["eval_config"])
    eval_config = EvalConfig(; eval_dict...)

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
        return HTTP.Response(400, "Unknown Scheduler Type")
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
        # Parse comma-separated strings into Julia Tuples
        # E.g., "64, 64, 128" -> (64, 64, 128)
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
        return HTTP.Response(400, "Unknown Solver Type")
    end

    # Execute the Pipeline
    # This will block until the training/evaluation is complete.
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
end

# Start the Server
println("\n===================================================================")
println("🚀 GridapROMs API Server is running!")
println("📡 Listening for React Dashboard on: http://127.0.0.1:8080")
println("===================================================================\n")

# Attach the CORS middleware and start serving
serve(host="127.0.0.1", port=8080, middleware=[cors_middleware])
