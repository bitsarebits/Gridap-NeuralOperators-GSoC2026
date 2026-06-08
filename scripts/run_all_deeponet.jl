using DrWatson
@quickactivate "experiments_NeuralOperators"

include("generate_data.jl")
include("train_deeponet.jl")
include("plot_deeponet.jl")

# Helper function to filter out `nothing` values before passing kwargs
filter_kwargs(kwargs_dict) = Dict{Symbol,Any}(k => v for (k, v) in kwargs_dict if !isnothing(v))

"""
    run_pipeline(; kwargs...)

Orchestrates the Neural Operator workflow end-to-end using a smart, hash-driven
caching mechanism. It linearly propagates execution through Data Generation,
Model Training, and Zero-Shot Evaluation.

If a specific configuration has already been computed in the past, the pipeline
automatically identifies it via `registry.json` and skips the heavy computations,
instantly passing the resulting hash to the next stage.

Exposes all underlying physical, numerical, and architectural parameters
for easy experimentation via the REPL.

# Output
Executes the full chain and prints the resulting `data_hash`, `model_hash`,
and `eval_hash` to the standard output.
"""
function run_pipeline(;
    # Generation Parameters (Optional)
    beta_start::Union{Float64,Nothing}=nothing,
    beta_end::Union{Float64,Nothing}=nothing,
    beta_step::Union{Float64,Nothing}=nothing,
    order::Union{Int,Nothing}=nothing,
    L::Union{Float64,Nothing}=nothing,
    nx::Union{Int,Nothing}=nothing,
    t0::Union{Float64,Nothing}=nothing,
    dt::Union{Float64,Nothing}=nothing,
    tf::Union{Float64,Nothing}=nothing,
    c::Union{Float64,Nothing}=nothing,
    theta::Union{Float64,Nothing}=nothing,

    # Training Parameters (Optional)
    epochs::Union{Int,Nothing}=nothing,
    step_x::Union{Int,Nothing}=nothing,
    step_t::Union{Int,Nothing}=nothing,

    # Architecture Parameters (Shared, Optional)
    m_sensors::Union{Int,Nothing}=nothing,
    p_latent::Union{Int,Nothing}=nothing,
    hidden::Union{Int,Nothing}=nothing,

    # Evaluation Parameter (Optional)
    test_sigma::Union{Float64,Nothing}=nothing
)
    println("=====================================================")
    println("STARTING COMPLETE DEEPONET PIPELINE END-TO-END")
    println("=====================================================")

    # Data
    gen_kwargs = filter_kwargs(Dict(
        :beta_start => beta_start,
        :beta_end => beta_end,
        :beta_step => beta_step,
        :order => order,
        :L => L,
        :nx => nx,
        :t0 => t0,
        :dt => dt,
        :tf => tf,
        :c => c,
        :theta => theta
    ))
    data_hash = run_generate_data(; gen_kwargs...)

    # Model
    train_kwargs = filter_kwargs(Dict(
        :data_hash => data_hash,
        :n_epochs => epochs,
        :step_x => step_x,
        :step_t => step_t,
        :m_sensors => m_sensors,
        :p_latent => p_latent,
        :hidden => hidden
    ))
    model_hash = run_train_deeponet(; train_kwargs...)

    # Evaluation
    plot_kwargs = filter_kwargs(Dict(
        :model_hash => model_hash,
        :sigma_test => test_sigma
    ))
    eval_hash = run_plot_deeponet(; plot_kwargs...)

    println("\n=====================================================")
    println("PIPELINE COMPLETED SUCCESSFULLY")
    println("Data Hash : $data_hash")
    println("Model Hash: $model_hash")
    println("Eval Hash : $eval_hash")
    println("=====================================================")
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Parsing ARGS with default fallbacks.
    # Here we expose the most common orchestration flags.
    # For deep parameter tuning, use `run_pipeline(; kwargs...)` directly in the REPL.

    epochs_val = length(ARGS) > 0 ? parse(Int, ARGS[1]) : nothing
    sigma_val = length(ARGS) > 1 ? parse(Float64, ARGS[2]) : nothing
    f_data = length(ARGS) > 2 ? parse(Bool, ARGS[3]) : false
    f_train = length(ARGS) > 3 ? parse(Bool, ARGS[4]) : false

    run_pipeline(
        epochs=epochs_val,
        test_sigma=sigma_val,
        force_data=f_data,
        force_train=f_train
    )
end
