using DrWatson
@quickactivate :experiments_NeuralOperators

# Custom modules
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.Pipelines

"""
    run_train(model::DeepONet; data_hash::String, kwargs...)

Loads pre-computed High-Fidelity FEM snapshots using the provided `data_hash`,
formats them into Branch (sensors) and Trunk (coordinates) inputs, and orchestrates
the DeepONet training loop via XLA (Reactant.jl).

# Required Arguments
- `data_hash::String`: The 12-character SHA-256 hash of the source FEM dataset.

# Keyword Arguments
- `n_epochs::Int=20000`: Total training epochs.
- `step_x::Int=10`: Spatial subsampling step (reduces grid size).
- `step_t::Int=5`: Temporal subsampling step.
- `m_sensors::Int=100`: Number of input sensors for the Branch Net.
- `p_latent::Int=64`: Dimensionality of the latent space (output of Branch/Trunk).
- `hidden::Int=64`: Number of neurons per hidden layer in the MLPs.

# Output
- Saves the trained model weights to `data/models/deeponet/model_<model_hash>.jld2`.
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
