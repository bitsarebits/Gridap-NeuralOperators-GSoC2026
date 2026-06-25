using DrWatson
@quickactivate :experiments_NeuralOperators

include("generate_data.jl")
include("train_model.jl")
include("plot_model.jl")

using experiments_NeuralOperators.Solvers

"""
    run_pipeline(model::AbstractNeuralModel=DeepONet(); kwargs...)

Orchestrates the Neural Operator workflow end-to-end using a smart, hash-driven
caching mechanism. It linearly propagates execution through Data Generation,
Model Training, and Zero-Shot Evaluation.

If a specific configuration has already been computed in the past, the pipeline
automatically identifies it via `registry.json` and skips the heavy computations,
instantly passing the resulting hash to the next stage.

Exposes all underlying physical, numerical, and architectural parameters
for easy experimentation via the REPL.

# Output
Executes the full chain and prints the resulting `data_hash`, `model_hash`,
and `eval_hash` to the standard output.
"""
function run_pipeline(
    solver::AbstractNeuralSolver,
    fem_config::FEMConfig,
    eval_config::EvalConfig
)
    solver_name = get_solver_name(solver)
    println("=====================================================")
    println("STARTING END-TO-END PIPELINE FOR: $(solver_name)")
    println("=====================================================")

    # Data
    data_hash = run_generate_data(fem_config)

    # Model
    model_hash = run_train(solver, data_hash)

    # Evaluation and plotting
    eval_hash = run_plot(solver, model_hash, eval_config)

    println("\n=====================================================")
    println("PIPELINE COMPLETED SUCCESSFULLY")
    println("Data Hash : $data_hash")
    println("Model Hash: $model_hash")
    println("Eval Hash : $eval_hash")
    println("=====================================================")
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
