using DrWatson
@quickactivate :experiments_NeuralOperators

include("generate_data.jl")
include("train_model.jl")
include("plot_model.jl")

using experiments_NeuralOperators.ModelTypes

# Helper function to filter out `nothing` values before passing kwargs
filter_kwargs(kwargs_dict) = Dict{Symbol,Any}(k => v for (k, v) in kwargs_dict if !isnothing(v))

"""
    run_pipeline(model::AbstractNeuralModel=DeepONet(); kwargs...)

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
function run_pipeline(model::AbstractNeuralModel=DeepONet();
    # Generation Parameters
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

    # Training Parameters (DeepONet)
    epochs::Union{Int,Nothing}=nothing,
    step_x::Union{Int,Nothing}=nothing,
    step_t::Union{Int,Nothing}=nothing,

    # Architecture Parameters (DeepONet)
    m_sensors::Union{Int,Nothing}=nothing,
    p_latent::Union{Int,Nothing}=nothing,
    hidden::Union{Int,Nothing}=nothing,

    # Training Parameters (FNO)
    nx_red::Union{Int,Nothing}=nothing,
    nt_red::Union{Int,Nothing}=nothing,

    # Architecture Parameters (FNO)
    hidden_channels::Union{Tuple,Nothing}=nothing,
    modes::Union{Tuple,Nothing}=nothing,

    # Scheduler
    lr_scheduler::Union{AbstractLRScheduler,Type{<:AbstractLRScheduler},Nothing}=nothing,

    # Evaluation Parameter
    sigma_test::Union{Float64,Nothing}=nothing
)
    model_name_str = get_model_name(model)
    println("=====================================================")
    println("STARTING END-TO-END PIPELINE FOR: $(model_name_str)")
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
        # DeepONet
        :step_x => step_x,
        :step_t => step_t,
        :m_sensors => m_sensors,
        :p_latent => p_latent,
        :hidden => hidden,
        # FNO
        :nx_red => nx_red,
        :nt_red => nt_red,
        :hidden_channels => hidden_channels,
        :modes => modes,
        # Scheduler
        :lr_scheduler => lr_scheduler,
    ))
    model_hash = run_train(model; train_kwargs...)

    # Evaluation and Plot
    plot_kwargs = filter_kwargs(Dict(
        :model_hash => model_hash,
        :sigma_test => sigma_test
    ))
    eval_hash = run_plot(model; plot_kwargs...)

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
    # Terminal usage: julia run_all_models.jl [model_type] [epochs] [test_sigma]

    # Model (Default: DeepONet)
    model_instance = DeepONet()
    if length(ARGS) > 0
        m_str = lowercase(ARGS[1])
        if m_str == "fno"
            model_instance = FNO()
        elseif m_str == "nomad"
            model_instance = NOMAD()
        elseif m_str == "deeponet"
            model_instance = DeepONet()
        else
            println("Unknown model '$m_str' passed from terminal. Defaulting to DeepONet.")
        end
    end

    # Parsing parameters
    epochs_val = length(ARGS) > 1 ? parse(Int, ARGS[2]) : nothing
    sigma_val = length(ARGS) > 2 ? parse(Float64, ARGS[3]) : nothing

    # run the pipeline
    run_pipeline(
        model_instance,
        epochs=epochs_val,
        sigma_test=sigma_val
    )
end
