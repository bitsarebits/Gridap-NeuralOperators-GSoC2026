# scripts/precompile_trace.jl

using Pkg
const EXPERIMENT_ROOT = joinpath(@__DIR__, "..")
Pkg.activate(EXPERIMENT_ROOT)

using Gridap
using GridapROMs
using NeuralOperators
using Lux
using Reactant
using Enzyme
using CairoMakie
using Oxygen
using HTTP
using JSON3

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
using experiments_NeuralOperators.DataGeneration
using experiments_NeuralOperators.HashRegistry

@info "Starting Precompile Trace for PackageCompiler..."

# Redirect stdout to avoid massive JIT compilation logs polluting the terminal
redirect_stdout(devnull) do


    # WARMUP CAIROMAKIE (Plotting Engine)
    fig = Figure()
    ax = Axis(fig[1, 1], title="Sysimage Trace", xlabel="x", ylabel="y")
    lines!(ax, rand(10), rand(10), color=:blue)

    buffer = IOBuffer()
    show(buffer, MIME"image/png"(), fig)
    close(buffer)

    #=
        # WARMUP REACTANT / LLVM INFRASTRUCTURE
        # force Julia to compile the MLIR/XLA
        # generation pathways, Enzyme AD, and Lux layer initializations.

        mini_nx = 32
        mini_batch = 2

        dummy_fem = Solvers.FEMConfig(nx=mini_nx, dt=0.1)
        σ_values = [[0.1], [0.2]] # 2 samples to simulate a small batch

        dummy_scheduler = LRSchedulers.CosineAnnealing(max_epochs=1)

        # Generate minimal dummy data
        fem_res = DataGeneration.generate_fem_snapshots(σ_values, dummy_fem)

        mock_fem_data = Dict(
            "config" => HashRegistry.struct_to_dict(dummy_fem),
            "snapshots" => fem_res.snapshots,
            "x_grid" => fem_res.x_grid,
            "t_grid" => fem_res.t_grid,
            "sigma_values" => σ_values
        )

        # Instantiate models with drastically reduced parameters to keep trace fast
        solvers_to_warmup = [
            # Miniature DeepONet
            Solvers.DeepONetSolver(
                epochs=1, batch_size=mini_batch, step_x=2, step_t=2,
                m_sensors=10, p_latent=8, hidden=8
            ),
            # Miniature FNO
            Solvers.FNOSolver(
                epochs=1, batch_size=mini_batch, nx_red=16, nt_red=10,
                hidden_channels=(8, 8, 8), modes=(4,)
            ),
            # Miniature NOMAD
            Solvers.NOMADSolver(
                epochs=1, batch_size=mini_batch, step_x=2, step_t=2,
                m_sensors=10, p_latent=8, hidden=8
            )
        ]

        # Trigger the compilation of the training loop for each architecture
        for solver in solvers_to_warmup
            experiments_NeuralOperators.TrainingLoops.prepare_and_train(
                solver, mock_fem_data, dummy_scheduler
            )
        end
    =#

    # WARMUP OXYGEN.JL & HTTP
    @get "/_precompile_ping" function (req)
        return json(Dict("status" => "ready"))
    end

    req = HTTP.Request("GET", "/_precompile_ping")
    Oxygen.internalrequest(req)

end # end redirect_stdout

@info "Precompile Trace finished successfully."
