module experiments_NeuralOperators

# Utils
include("Utils.jl")

# base modules
include("Auth.jl")
include("FirebaseREST.jl")
include("LRSchedulers.jl")
include("Solvers.jl")
include("HashRegistry.jl")
include("DataGeneration.jl")
include("DeepONetArch.jl")
include("FNOArch.jl")
include("NOMADArch.jl")

# Functionalities
include("TrainingLoops.jl")
include("Inference.jl")

# Orchestrator
include("Pipelines.jl")

# Export submodules for the scripts
export HashRegistry, DataGeneration, DeepONetArch, FNOArch, NOMADArch, Pipelines, TrainingLoops, Inference, Utils, LRSchedulers, Solvers, Auth, FirebaseREST

using PrecompileTools

# We only import modules that are 100% pure Julia for disk-based precompilation.
using .Solvers
using .DataGeneration

@setup_workload begin
    # Define a minimal workload to warm up Gridap.jl
    dummy_fem = FEMConfig(nx=10, t0=0.0, tf=0.1, dt=0.05, L=1.0)

    # We only test a single physical parameter configuration
    σ_values = [[0.1]]

    @compile_workload begin
        redirect_stdout(devnull) do
            # JIT compile Gridap (Pure Julia, SAFE to serialize to disk)
            # This generates the assembly matrices, traces the weak forms, and compiles the ODE solver.
            # By doing this here, we completely eliminate the "Time to First Solve" for the Finite Element data generation.
            DataGeneration.generate_fem_snapshots(σ_values, dummy_fem)

            # NOTE: Reactant/XLA neural network training is intentionally omitted here.
            # XLA allocates memory via raw C++ device pointers (Ptr{Nothing}).
            # Trying to serialize C++ pointers into Julia's compiled .ji files will cause SegFaults and MethodErrors.
            # The warmup for Reactant is handled dynamically in RAM by the HTTP Server's background task (@spawn).
        end
    end
end

end
