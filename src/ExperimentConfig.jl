Base.@kwdef struct DatasetConfig
    beta_start::Float64 = 1.0
    beta_end::Float64 = 3.0
    beta_step::Float64 = 0.2

    nx::Int = 100
    order::Int = 1

    c::Float64 = 1.0
    tf::Float64 = 1.0
    n_train::Int = 20
    n_test::Int = 10
end

Base.@kwdef struct ModelConfig
    architecture::Symbol = :deeponet

    width::Int = 64
    depth::Int = 3

    epochs::Int = 5000
    batch_size::Int = 32

    space_step::Int = 1
    time_step::Int = 1

    seed::Int = 10
end

Base.@kwdef struct EvaluationConfig
    n_test::Int = 10
    seed::Int = 10
end

Base.@kwdef struct ExperimentConfig
    dataset::DatasetConfig = DatasetConfig()
    model::ModelConfig = ModelConfig()
    evaluation::EvaluationConfig = EvaluationConfig()
end
