using DrWatson
@quickactivate :experiments_NeuralOperators

# Custom modules
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.Pipelines

"""
    run_plot(model::DeepONet; model_hash::String, kwargs...)

Evaluates a trained DeepONet model on an unseen parameter (Zero-Shot execution),
benchmarks its inference time against the Gridap FEM solver, and generates
a comparative plot.

# Required Arguments
- `model_hash::String`: The 12-character SHA-256 hash of the trained model.

# Keyword Arguments
- `sigma_test::Float64=0.03`: The unseen standard deviation to evaluate the model on.

# Output
- Saves a comparative visualization to `plots/deeponet/eval_<eval_hash>.png`.
- Updates `data/registry.json` under the "evaluations" category.
- **Returns:** `eval_hash::String` confirming successful plot generation.
"""
function run_plot(solver::AbstractNeuralSolver, model_hash::String, eval_config::EvalConfig)
    return execute_plot_pipeline(solver, model_hash, eval_config)
end

if abspath(PROGRAM_FILE) == @__FILE__
    # Usage: julia plot_model.jl [model_hash] [model_type] [sigma_test]
    m_hash = length(ARGS) > 0 ? ARGS[1] : error("Provide model_hash")
    m_type = length(ARGS) > 1 ? lowercase(ARGS[2]) : "deeponet"
    s_val = length(ARGS) > 2 ? parse(Float64, ARGS[3]) : 0.03

    eval_config = EvalConfig(sigma_test=s_val)

    if m_type == "fno"
        solver = FNOSolver()
    else
        solver = DeepONetSolver()
    end

    run_plot(solver, m_hash, eval_config)
end
