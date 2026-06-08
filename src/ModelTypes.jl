module ModelTypes

export AbstractNeuralModel, DeepONet, FNO, NOMAD, get_model_name

# Base type
abstract type AbstractNeuralModel end

# Concrete types
struct DeepONet <: AbstractNeuralModel end
struct FNO <: AbstractNeuralModel end
struct NOMAD <: AbstractNeuralModel end

"""
    get_model_name(model::AbstractNeuralModel)

Extract the struct name dynamically as a string.
Ex: get_model_name(DeepONet()) returns "DeepONet".
"""
get_model_name(::T) where {T<:AbstractNeuralModel} = string(nameof(T))

end # module
