module experiments_NeuralOperators

# Utils
include("Utils.jl")

# base modules
include("LRSchedulers.jl")
include("Solvers.jl")
include("HashRegistry.jl")
include("DataGeneration.jl")
include("DeepONetArch.jl")
include("FNOArch.jl")

# Functionalities
include("TrainingLoops.jl")
include("Inference.jl")

# Orchestrator
include("Pipelines.jl")

# Export submodules for the scripts
export HashRegistry, DataGeneration, DeepONetArch, FNOArch, Pipelines, TrainingLoops, Inference, Utils, LRSchedulers, Solvers

end
