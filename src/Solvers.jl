module Solvers

using ..LRSchedulers

export AbstractNeuralSolver, DeepONetSolver, FNOSolver, NOMADSolver
export FEMConfig, EvalConfig
export get_solver_name

# Base type
abstract type AbstractNeuralSolver end

# Helper
"""
    get_solver_name(solver::AbstractNeuralSolver)

Extract the struct name as a string.
Ex: get_solver_name(DeepONetSolver()) returns "DeepONetSolver".
"""
get_solver_name(::T) where {T<:AbstractNeuralSolver} = string(nameof(T))

# FEM Parameters
Base.@kwdef struct FEMConfig
    beta_start::Float64 = 1.0
    beta_end::Float64 = 2.0
    beta_step::Float64 = 0.2
    order::Int = 3
    L::Float64 = 5.0
    nx::Int = 1000
    t0::Float64 = 0.0
    dt::Float64 = 0.01
    tf::Float64 = 1.0
    c::Float64 = 1.0
    theta::Float64 = 0.5
end

# Neural Operator Solvers
Base.@kwdef struct DeepONetSolver <: AbstractNeuralSolver
    # Training
    epochs::Int = 20000
    batch_size::Int = 0  # 0 indicates Full Batch
    step_x::Int = 10
    step_t::Int = 5
    lr_scheduler::AbstractLRScheduler = CosineAnnealing()

    # Architecture
    m_sensors::Int = 100
    p_latent::Int = 64
    hidden::Int = 64

    # Fine-Tuning
    pretrained_model_hash::String = ""
end

Base.@kwdef struct FNOSolver <: AbstractNeuralSolver
    # Training
    epochs::Int = 20000
    batch_size::Int = 32 # Default mini-batch
    nx_red::Int = 256
    nt_red::Int = 50
    lr_scheduler::AbstractLRScheduler = CosineAnnealing()

    # Architecture
    hidden_channels::Tuple = (64, 64, 128)
    modes::Tuple = (32,)

    # Fine-Tuning
    pretrained_model_hash::String = ""
end

Base.@kwdef struct NOMADSolver <: AbstractNeuralSolver
    # Training
    epochs::Int = 10000
    batch_size::Int = 2048 # Strict mini-batch requirement for flattened coordinates
    step_x::Int = 10
    step_t::Int = 5
    lr_scheduler::AbstractLRScheduler = CosineAnnealing()

    # Architecture
    m_sensors::Int = 200
    p_latent::Int = 64
    hidden::Int = 64

    # Fine-Tuning
    pretrained_model_hash::String = ""
end

# Evaluation Parameters
Base.@kwdef struct EvalConfig
    sigma_test::Float64 = 0.03
end

end
