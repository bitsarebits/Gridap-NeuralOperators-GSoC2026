module experiments_NeuralOperators

# Utils
include("Utils.jl")

# base modules
include("ModelTypes.jl")
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
export ModelTypes, HashRegistry, DataGeneration, DeepONetArch, FNOArch, Pipelines, TrainingLoops, Inference, Utils

end
