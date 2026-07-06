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

end
