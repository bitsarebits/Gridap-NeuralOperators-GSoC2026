using DrWatson
@quickactivate :experiments_NeuralOperators

using JLD2
using Gridap
using GridapROMs

"""
    run_generate_data(; kwargs...)

Executes the end-to-end pipeline for generating High-Fidelity (FEM) snapshots.

This function defines the parameter space for the standard deviation (σ) of the
initial Gaussian pulse and calls the core `generate_fem_snapshots` logic.
It calculates a unique SHA-256 hash based on the physical and numerical parameters,
acting as an automatic caching mechanism to avoid redundant computations.

# Keyword Arguments
- `beta_start::Float64=1.0`: The starting exponent β for the parameter space `σ = 10^-β`.
- `beta_end::Float64=2.0`: The final exponent β for the parameter space.
- `beta_step::Float64=0.2`: The step size for generating the range of β values.
- `order::Int=3`: The polynomial degree (order) of the finite element space.
- `L::Float64=5.0`: Domain half-length `[-L, L]`.
- `nx::Int=1000`: Number of spatial partitions (elements) for the FEM grid.
- `t0::Float64=0.0`: Initial simulation time.
- `dt::Float64=0.01`: Time step size for the simulation.
- `tf::Float64=1.0`: Final simulation time.
- `c::Float64=1.0`: Advection velocity of the Gaussian pulse.
- `theta::Float64=0.5`: Theta-method parameter (0.5 corresponds to Crank-Nicolson).

# Output
- Saves the FEM tensors to `data/sims/data_<data_hash>.jld2`.
- Updates `data/registry.json` linking the configuration to the generated hash.
- **Returns:** `data_hash::String` to be passed to downstream modeling scripts.
"""
function run_generate_data(;
    beta_start::Float64=1.0,
    beta_end::Float64=2.0,
    beta_step::Float64=0.2,
    order::Int=3,
    L::Float64=5.0,
    nx::Int=1000,
    t0::Float64=0.0,
    dt::Float64=0.01,
    tf::Float64=1.0,
    c::Float64=1.0,
    theta::Float64=0.5
)

    # Configuration and Hash
    n_sigma = length(beta_start:beta_step:beta_end)
    config = @strdict(
        beta_start,
        beta_end,
        beta_step,
        n_sigma,
        order,
        L,
        nx,
        t0,
        dt,
        tf,
        c,
        theta
    )
    data_hash = HashRegistry.config_hash(config)
    output_file = datadir("sims", "data_$(data_hash).jld2")

    # Cache check
    if HashRegistry.HashRegistry.check_registry("data", data_hash) && isfile(output_file)
        println("Dataset already exists with Hash: [$data_hash]. Skipping generation.")
        return data_hash
    end

    # Generation if not already existing
    println("--- Generating new High-Fidelity FEM Data (Hash: $data_hash) ---")

    # Define the parameter space
    σ_values = [[10.0^-β] for β in beta_start:beta_step:beta_end]

    # Generate data using the custom function
    @time results = DataGeneration.generate_fem_snapshots(
        σ_values;
        order=order,
        L=L,
        nx=nx,
        t0=t0,
        dt=dt,
        tf=tf,
        c=c,
        θ=theta
    )

    println("Generation completed")
    println("Snapshots shape (Nx, N_sigma, Nt): ", size(results.snapshots))

    # Store results
    mkpath(datadir("sims"))  # Ensure the directory exists

    # Save the generated tensors and metadata
    jldsave(output_file;
        snapshots=results.snapshots,
        x_grid=results.x_grid,
        t_grid=results.t_grid,
        sigma_values=σ_values,
        config=config
    )

    HashRegistry.update_registry!("data", data_hash, config)
    println("Data saved to: $output_file")

    return data_hash
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Positional argument parsing from terminal.
    # We parse the most common parameters. For full control, use REPL with kwargs.
    b_start = length(ARGS) > 0 ? parse(Float64, ARGS[1]) : 1.0
    b_end = length(ARGS) > 1 ? parse(Float64, ARGS[2]) : 2.0
    b_step = length(ARGS) > 2 ? parse(Float64, ARGS[3]) : 0.2
    nx_val = length(ARGS) > 3 ? parse(Int, ARGS[4]) : 1000

    run_generate_data(
        beta_start=b_start,
        beta_end=b_end,
        beta_step=b_step,
        nx=nx_val
    )
end
