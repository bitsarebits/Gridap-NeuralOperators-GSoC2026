using DrWatson
@quickactivate "experiments_NeuralOperators"

using JLD2
using Gridap
using GridapROMs

# Load data generation module
include(srcdir("DataGeneration.jl"))
using .DataGeneration

"""
    run_generate_data(; kwargs...)

Executes the end-to-end pipeline for generating High-Fidelity (FEM) snapshots.

This function defines the parameter space for the standard deviation (σ) of the
initial Gaussian pulse and calls the core `generate_fem_snapshots` logic.
It consolidates the configuration into a metadata dictionary and saves the resulting
snapshot tensors, spatial grid, and time grid to disk in JLD2 format.

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
Saves a `fem_snapshots.jld2` file inside the `data/sims/` directory containing:
- `snapshots`: The 3D tensor of FEM solutions (Space * Parameters * Time).
- `x_grid`: The spatial Degrees of Freedom.
- `t_grid`: The temporal grid.
- `sigma_values`: The explicit list of σ values used.
- `config`: A dictionary containing all the generation parameters for reproducibility.
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
    println("--- Starting High-Fidelity FEM Data Generation ---")

    # Define the parameter space
    σ_values = [[10.0^-β] for β in beta_start:beta_step:beta_end]

    # Define physical and numerical configuration
    n_sigma = length(σ_values)
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

    println("Configuration loaded. Computing snapshots for $(config["n_sigma"]) parameters...")

    # Generate data using the custom function
    @time results = DataGeneration.generate_fem_snapshots(
        σ_values;
        order=config["order"],
        L=config["L"],
        nx=config["nx"],
        t0=config["t0"],
        dt=config["dt"],
        tf=config["tf"],
        c=config["c"],
        θ=config["theta"]
    )

    println("Generation completed")
    println("Snapshots shape (Nx, N_sigma, Nt): ", size(results.snapshots))

    # Define output path dynamically with datadir
    output_path = datadir("sims")
    mkpath(output_path) # Ensure the directory exists
    output_file = joinpath(output_path, "fem_snapshots.jld2")

    # Save the generated tensors and metadata
    jldsave(output_file;
        snapshots=results.snapshots,
        x_grid=results.x_grid,
        t_grid=results.t_grid,
        sigma_values=σ_values,
        config=config
    )

    println("Data saved to: $output_file")
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Positional argument parsing from terminal.
    # We parse the most common parameters. For full control, use REPL with kwargs.
    b_start = length(ARGS) > 0 ? parse(Float32, ARGS[1]) : 1.0
    b_end = length(ARGS) > 1 ? parse(Float32, ARGS[2]) : 2.0
    b_step = length(ARGS) > 2 ? parse(Float32, ARGS[3]) : 0.2
    nx_val = length(ARGS) > 3 ? parse(Int, ARGS[4]) : 1000

    run_generate_data(
        beta_start=b_start,
        beta_end=b_end,
        beta_step=b_step,
        nx=nx_val
    )
end
