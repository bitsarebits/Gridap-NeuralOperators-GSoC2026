using DrWatson
@quickactivate :experiments_NeuralOperators

# Custom modules
using experiments_NeuralOperators.Pipelines
using experiments_NeuralOperators.ModelTypes

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
function run_train(model::DeepONet;
    data_hash::String,
    n_epochs::Int=20000,
    step_x::Int=10,
    step_t::Int=5,
    m_sensors::Int=100,
    p_latent::Int=64,
    hidden::Int=64,
)
    # The configuration dict now explicitly captures all defaults ensuring safe hashing
    model_type = get_model_name(model)
    config = @strdict(
        model_type,
        data_hash,
        n_epochs,
        step_x,
        step_t,
        m_sensors,
        p_latent,
        hidden
    )

    # Pass the fully populated dictionary to the I/O handler
    return execute_train_pipeline(model, config)
end

"""
    run_train(model::FNO; data_hash::String, kwargs...)

Loads pre-computed High-Fidelity FEM snapshots using the provided `data_hash`,
formats them into a multi-channel tensor, and orchestrates the Fourier Neural
Operator (FNO) training loop via XLA (Reactant.jl).

# Required Arguments
- `data_hash::String`: The 12-character SHA-256 hash of the source FEM dataset.

# Keyword Arguments
- `n_epochs::Int=10000`: Total training epochs.
- `nx_red::Int=256`: Number of spatial nodes to extract from the full FEM grid.
  For optimal Fast Fourier Transform (FFT) performance, it is highly recommended
  to use powers of 2 (e.g., 64, 128, 256, 512).
- `nt_red::Int=50`: Number of temporal steps to extract. Represents the output
  channels of the operator.
- `hidden_channels::Tuple=(64, 64, 128)`: Number of channels in the hidden Fourier layers.
- `modes::Tuple=(32,)`: Number of lower-frequency Fourier modes to retain. Must be
  strictly less than `nx_red ÷ 2`.

# Output
- Saves the trained model weights to `data/models/fno/model_<model_hash>.jld2`.
- Updates `data/registry.json` under the "models" category.
- **Returns:** `model_hash::String` to be passed to evaluation scripts.
"""
function run_train(model::FNO;
    data_hash::String,
    n_epochs::Int=20000,
    nx_red::Int=256,
    nt_red::Int=50,
    hidden_channels::Tuple=(64, 64, 128),
    modes::Tuple=(32,)
)
    model_type = get_model_name(model)
    config = @strdict(
        model_type,
        data_hash,
        n_epochs,
        nx_red,
        nt_red,
        hidden_channels,
        modes
    )

    return execute_train_pipeline(model, config)
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Allow terminal execution with: julia train_deeponet.jl [epochs] [step_x] [step_t]
    e_val = length(ARGS) > 0 ? parse(Int, ARGS[1]) : 20000
    sx_val = length(ARGS) > 1 ? parse(Int, ARGS[2]) : 10
    st_val = length(ARGS) > 2 ? parse(Int, ARGS[3]) : 5

    run_train(DeepONet(); data_hash="hash", n_epochs=e_val, step_x=sx_val, step_t=st_val)
end
