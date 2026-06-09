using DrWatson
@quickactivate :experiments_NeuralOperators

# Custom modules
using experiments_NeuralOperators.ModelTypes
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
function run_plot(model::DeepONet;
    model_hash::String,
    sigma_test::Float64=0.03
)
    config = @strdict(model_hash, sigma_test)
    return execute_plot_pipeline(model, config)
end

"""
    run_plot(model::FNO; model_hash::String, kwargs...)

Evaluates a trained FNO model on an unseen parameter (Zero-Shot execution),
benchmarks its inference time against the Gridap FEM solver, and generates
a comparative plot. Highlights FNO's zero-shot super-resolution.

# Required Arguments
- `model_hash::String`: The 12-character SHA-256 hash of the trained model.

# Keyword Arguments
- `sigma_test::Float64=0.03`: The unseen standard deviation to evaluate the model on.

# Output
- Saves a comparative visualization to `plots/fno/eval_<eval_hash>.png`.
- Updates `data/registry.json` under the "evaluations" category.
- **Returns:** `eval_hash::String` confirming successful plot generation.
"""
function run_plot(model::FNO;
    model_hash::String,
    sigma_test::Float64=0.03
)
    config = @strdict(model_hash, sigma_test)
    return execute_plot_pipeline(model, config)
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Requires an explicitly passed model_hash from terminal to work properly.
    h_val = length(ARGS) > 0 ? ARGS[1] : "hash"
    s_val = length(ARGS) > 1 ? parse(Float64, ARGS[2]) : 0.03

    run_plot(DeepONet(); model_hash=h_val, sigma_test=s_val)
end
