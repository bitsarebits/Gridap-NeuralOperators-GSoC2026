using DrWatson
@quickactivate :experiments_NeuralOperators

# Custom modules
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.Pipelines

"""
    run_train(solver::AbstractNeuralSolver, data_hash::String)

Loads pre-computed High-Fidelity FEM snapshots using the provided `data_hash`,
formats them into Branch (sensors) and Trunk (coordinates) inputs, and orchestrates
the training loop for the specified Neural Operator model via XLA (Reactant.jl).

- `solver::AbstractNeuralSolver`: An instance of a solver (e.g., `DeepONetSolver` or `FNOSolver`) containing the training and architectural hyperparameters.
- `data_hash::String`: The 12-character SHA-256 hash of the source FEM dataset.

# Output
- Saves the trained model weights to `data/models/<solver_name>/model_<model_hash>.jld2`.
- Updates `data/registry.json` under the "models" category.
- **Returns:** `model_hash::String` to be passed to evaluation scripts.
"""
function run_train(solver::AbstractNeuralSolver, data_hash::String)
    return execute_train_pipeline(solver, data_hash)
end


if abspath(PROGRAM_FILE) == @__FILE__
    # Usage: julia train_model.jl [data_hash] [model_type] [epochs]
    d_hash = length(ARGS) > 0 ? ARGS[1] : error("Provide data_hash")
    m_type = length(ARGS) > 1 ? lowercase(ARGS[2]) : "deeponet"
    e_val = length(ARGS) > 2 ? parse(Int, ARGS[3]) : 20000

    if m_type == "fno"
        solver = FNOSolver(epochs=e_val)
    else
        solver = DeepONetSolver(epochs=e_val)
    end

    run_train(solver, d_hash)
end
