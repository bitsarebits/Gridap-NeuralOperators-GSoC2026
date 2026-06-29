using DrWatson
@quickactivate :experiments_NeuralOperators

include("generate_data.jl")
include("train_model.jl")
include("plot_model.jl")

using experiments_NeuralOperators.Solvers

"""
    run_pipeline(solver::AbstractNeuralSolver, fem_config::FEMConfig, eval_config::EvalConfig)

Orchestrates the Neural Operator workflow end-to-end using a smart, hash-driven
caching mechanism. It linearly propagates execution through Data Generation,
Model Training, and Zero-Shot Evaluation.

If a specific configuration has already been computed in the past, the pipeline
automatically identifies it via `registry.json` and skips the heavy computations,
instantly passing the resulting hash to the next stage.

Exposes all underlying physical, numerical, and architectural parameters
for easy experimentation via the REPL.

# Arguments
- `solver::AbstractNeuralSolver`: An instance of a solver (e.g., `DeepONetSolver` or `FNOSolver`) with its architectural and training hyperparameters.
- `fem_config::FEMConfig`: A struct containing all parameters for the high-fidelity FEM data generation.
- `eval_config::EvalConfig`: A struct containing parameters for the evaluation and plotting phase.

# kwargs
- `log_cb`: callback function to send log to the frontend

# Output
Executes the full chain and prints the resulting `data_hash`, `model_hash`,
and `eval_hash` to the standard output.
"""
function run_pipeline(
    solver::AbstractNeuralSolver,
    fem_config::FEMConfig,
    eval_config::EvalConfig
    ;
    log_cb=(x)->nothing
)
    solver_name = get_solver_name(solver)
    println("=====================================================")
    println("STARTING END-TO-END PIPELINE FOR: $(solver_name)")
    println("=====================================================")

    log_cb(Dict("type" => "status", "stage" => "Starting pipeline execution..."))

    # Data
    log_cb(Dict("type" => "status", "stage" => "Phase 1/3: High-Fidelity Data Generation..."))
    data_hash = run_generate_data(fem_config)

    # Model
    log_cb(Dict("type" => "status", "stage" => "Phase 2/3: Neural Operator Training..."))
    model_hash = run_train(solver, data_hash; log_cb)

    # Evaluation and plotting
    log_cb(Dict("type" => "status", "stage" => "Phase 3/3: Model Evaluation and Plotting..."))
    eval_hash = run_plot(solver, model_hash, eval_config)

    log_cb(Dict("type" => "status", "stage" => "Pipeline completed successfully!"))

    println("\n=====================================================")
    println("PIPELINE COMPLETED SUCCESSFULLY")
    println("Data Hash : $data_hash")
    println("Model Hash: $model_hash")
    println("Eval Hash : $eval_hash")
    println("=====================================================")

    return data_hash, model_hash, eval_hash
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Terminal usage: julia run_all_models.jl [model_type] [epochs] [test_sigma] [nx]

    m_str = length(ARGS) > 0 ? lowercase(ARGS[1]) : "deeponet"
    epochs_val = length(ARGS) > 1 ? parse(Int, ARGS[2]) : 20000
    sigma_val = length(ARGS) > 3 ? parse(Float64, ARGS[3]) : 0.03
    nx_val = length(ARGS) > 4 ? parse(Int, ARGS[4]) : 1000

    # Config objects, using default values of Solvers.jl
    fem_config = FEMConfig(nx=nx_val)
    eval_config = EvalConfig(sigma_test=sigma_val)

    if m_str == "fno"
        solver = FNOSolver(epochs=epochs_val)
    elseif m_str == "nomad"
        # solver = NOMADSolver(epochs=epochs_val)
        error("NOMAD not implemented yet")
    else
        solver = DeepONetSolver(epochs=epochs_val)
    end

    run_pipeline(solver, fem_config, eval_config)
end
