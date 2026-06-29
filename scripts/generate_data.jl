using DrWatson
@quickactivate :experiments_NeuralOperators

using JLD2
using Gridap
using GridapROMs

using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.DataGeneration
using experiments_NeuralOperators.HashRegistry

"""
    run_generate_data(config::FEMConfig)

Executes the end-to-end pipeline for generating High-Fidelity (FEM) snapshots.

This function defines the parameter space for the standard deviation (σ) of the
initial Gaussian pulse and calls the core `generate_fem_snapshots` logic.
It calculates a unique SHA-256 hash based on the physical and numerical parameters,
acting as a caching mechanism to avoid redundant computations.

# Arguments
- `config::FEMConfig`: A struct containing all physical and numerical parameters for the FEM simulation.

# Output
- Saves the FEM tensors to `data/sims/data_<data_hash>.jld2`.
- Updates `data/registry.json` linking the configuration to the generated hash.
- **Returns:** `data_hash::String` to be passed to downstream modeling scripts.
"""
function run_generate_data(config::FEMConfig)

    # Configuration and Hash
    data_hash = HashRegistry.config_hash(config)
    output_file = datadir("sims", "data_$(data_hash).jld2")

    # Cache check
    if HashRegistry.check_registry("data", data_hash) && isfile(output_file)
        println("Dataset already exists with Hash: [$data_hash]. Skipping generation.")
        return data_hash
    end

    # Generation if not already existing
    println("--- Generating new High-Fidelity FEM Data (Hash: $data_hash) ---")

    # Define the parameter space
    σ_values = [[10.0^-β] for β in config.beta_start:config.beta_step:config.beta_end]

    # Generate data using the custom function
    @time results = DataGeneration.generate_fem_snapshots(σ_values, config)

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
        config=HashRegistry.struct_to_dict(config)
    )

    HashRegistry.update_registry!("data", data_hash, config)
    println("Data saved to: $output_file")

    return data_hash
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Positional argument parsing from terminal.
    # Parsing the most common parameters. For full control, use REPL with kwargs.
    b_start = length(ARGS) > 0 ? parse(Float64, ARGS[1]) : 1.0
    b_end = length(ARGS) > 1 ? parse(Float64, ARGS[2]) : 2.0
    b_step = length(ARGS) > 2 ? parse(Float64, ARGS[3]) : 0.2
    nx_val = length(ARGS) > 3 ? parse(Int, ARGS[4]) : 1000

    config = FEMConfig(beta_start=b_start, beta_end=b_end, beta_step=b_step, nx=nx_val)
    run_generate_data(config)
end
