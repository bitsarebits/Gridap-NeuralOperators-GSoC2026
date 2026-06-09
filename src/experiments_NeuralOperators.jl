module experiments_NeuralOperators

# src folder files
include("ModelTypes.jl")
include("HashRegistry.jl")
include("DataGeneration.jl")
include("DeepONetArch.jl")
include("FNOArch.jl")

# Export submodules for the scripts
export ModelTypes, HashRegistry, DataGeneration, DeepONetArch, FNOArch

end
