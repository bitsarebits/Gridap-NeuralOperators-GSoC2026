using DrWatson
@quickactivate "experiments_NeuralOperators"

include("generate_data.jl")
include("train_deeponet.jl")
include("plot_deeponet.jl")

# Helper function to filter out `nothing` values before passing kwargs
filter_kwargs(kwargs_dict) = Dict{Symbol,Any}(k => v for (k, v) in kwargs_dict if !isnothing(v))

"""
    run_pipeline(; kwargs...)

Orchestrates the DeepONet workflow end-to-end. Skips data generation and training
if the respective output files already exist, unless forced.
Exposes all underlying physical, numerical, and architectural parameters.
"""
function run_pipeline(;
    # Pipeline Controls
    force_data::Bool=false,
    force_train::Bool=false,

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

    # Define artifact paths
    data_path = datadir("sims", "fem_snapshots.jld2")
    model_path = datadir("models", "deeponet_weights.jld2")

    # Generate High-Fidelity Data
    println("\nChecking Training Data...")
    if force_data || !isfile(data_path)
        println("Generating new dataset...")
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
        run_generate_data(; gen_kwargs...)
    else
        println("Data already exists at $data_path. Skipping generation.")
    end

    # Train the Neural Operator
    println("\nChecking DeepONet Model...")
    if force_train || !isfile(model_path)
        println("Training model for $epochs epochs...")
        train_kwargs = filter_kwargs(Dict(
            :n_epochs => epochs,
            :step_x => step_x,
            :step_t => step_t,
            :m_sensors => m_sensors,
            :p_latent => p_latent,
            :hidden => hidden
        ))
        run_train_deeponet(; train_kwargs...)
    else
        println("Pre-trained model found at $model_path. Skipping training.")
    end

    # Evaluate and Plot Zero-Shot performance
    println("\nEvaluating Model on Unseen Data (σ = $test_sigma)...")
    plot_kwargs = filter_kwargs(Dict(
        :sigma_test => test_sigma,
        :m_sensors => m_sensors,
        :p_latent => p_latent,
        :hidden => hidden
    ))
    run_plot_deeponet(; plot_kwargs...)

    println("\n=====================================================")
    println("PIPELINE COMPLETED SUCCESSFULLY")
    println("Check the 'plots/deeponet' folder for your results.")
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
