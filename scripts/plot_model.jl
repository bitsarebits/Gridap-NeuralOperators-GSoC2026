using DrWatson
@quickactivate :experiments_NeuralOperators

using JLD2
using Lux
using NeuralOperators
using Reactant
using Statistics
using CairoMakie
using AlgebraOfGraphics

# ------------- ORCHESTRATOR ------------------
"""
    execute_plot_pipeline(model::AbstractNeuralModel, config::Dict)

Internal core function. Handles registry validation, executing the High-Fidelity
FEM solver for benchmarking, triggering the model-specific inference dispatch,
and generating the comparative AlgebraOfGraphics plots.

# Arguments
- `model`: An instance of a concrete neural model type (e.g., `DeepONet()`).
- `config::Dict`: A dictionary containing `model_hash` and `sigma_test`.

# Returns
- `eval_hash::String`: The unique hash identifier of the evaluation.
"""
function execute_plot_pipeline(model::ModelTypes.AbstractNeuralModel, config::AbstractDict)
    model_hash = config["model_hash"]
    sigma_test = config["sigma_test"]
    model_type = ModelTypes.get_model_name(model)

    # Cache check
    eval_hash = HashRegistry.config_hash(config)
    save_path = plotsdir(lowercase(model_type), "eval_$(eval_hash).png")

    if HashRegistry.check_registry("evaluations", eval_hash) && isfile(save_path)
        println("Plot already exists for Hash: [$eval_hash]. Check $save_path")
        return eval_hash
    end

    # Extract Registry and Metadata
    registry = HashRegistry.load_registry()
    if !haskey(registry["models"], model_hash)
        error("Model hash [$model_hash] not found in registry.")
    end

    model_config = registry["models"][model_hash]
    data_hash = model_config["data_hash"]

    println("--- Starting $model_type Zero-Shot Evaluation (Eval Hash: $eval_hash) ---")
    println("Evaluating unseen parameter: σ = $sigma_test")

    # Load Dependencies
    weights_path = datadir("models", lowercase(model_type), "model_$(model_hash).jld2")
    weights_data = load(weights_path)

    data_path = datadir("sims", "data_$(data_hash).jld2")
    fem_data = load(data_path)
    fem_config = fem_data["config"]

    # Execute High-Fidelity FEM
    println("\nWARMUP PHASE: Compiling Gridap (This will take a moment)")
    _ = DataGeneration.generate_fem_snapshots(
        [[sigma_test]];
        order=fem_config["order"], L=fem_config["L"], nx=fem_config["nx"],
        t0=fem_config["t0"], dt=fem_config["dt"], tf=fem_config["tf"],
        c=fem_config["c"], θ=fem_config["theta"]
    )

    println("\nBENCHMARK PHASE: Measuring pure FEM execution time...")
    println("Generating High-Fidelity FEM solution for σ = $sigma_test...")
    t_fem = @elapsed begin
        hf_results = DataGeneration.generate_fem_snapshots(
            [[sigma_test]];
            order=fem_config["order"], L=fem_config["L"], nx=fem_config["nx"],
            t0=fem_config["t0"], dt=fem_config["dt"], tf=fem_config["tf"],
            c=fem_config["c"], θ=fem_config["theta"]
        )
    end
    x_hf_raw = hf_results.snapshots[:, 1, :]

    # Specialized Neural Inference Dispatch
    u_pred_matrix, t_grid_pred, t_nn = evaluate_and_predict(
        model, weights_data, fem_data, model_config, sigma_test
    )

    println("\n=== BENCHMARK RESULTS (σ = $sigma_test) ===")
    println("FEM Computation Time:  $(round(t_fem, digits=4)) seconds")
    println("$model_type Inference:    $(round(t_nn, digits=4)) seconds")
    println("Speedup Factor:        $(round(t_fem / max(t_nn, 1e-6), digits=1))x")
    println("====================================\n")

    # Plotting Generation
    println("Preparing the plot...")
    AoG = AlgebraOfGraphics
    AoG.set_aog_theme!()

    N_x_full = length(fem_data["x_grid"])
    N_t_plot = length(t_grid_pred)

    # Select start, middle, and end frames of the network's prediction
    t_indices = [1, div(N_t_plot, 2), N_t_plot]
    results, abs_errors, x_vals, x_vals2 = Float32[], Float32[], Float32[], Float32[]
    labels, alphas, alphas2 = String[], String[], String[]

    for idx in t_indices
        t_val = t_grid_pred[idx]

        # Robust mapping: Find the closest true HF timeframe regardless of ML subsampling
        idx_true = argmin(abs.(fem_data["t_grid"] .- t_val))
        u_true = Float32.(x_hf_raw[:, idx_true])

        u_pred = vec(u_pred_matrix[:, idx])

        l2_error = sqrt(mean(abs2, u_pred .- u_true))
        rel_error = (l2_error / max(sqrt(mean(abs2, u_true)), 1e-8)) * 100
        text_label = "t = $(round(t_val, digits=2))\n(Err: $(round(rel_error, digits=2))%)"

        append!(results, u_true)
        append!(labels, repeat(["High-Fidelity"], N_x_full))

        append!(results, u_pred)
        append!(labels, repeat([model_type], N_x_full))

        append!(x_vals, repeat(Float32.(fem_data["x_grid"]), 2))
        append!(alphas, repeat([text_label], N_x_full * 2))

        append!(abs_errors, abs.(u_pred .- u_true))
        append!(x_vals2, Float32.(fem_data["x_grid"]))
        append!(alphas2, repeat([text_label], N_x_full))
    end

    plot_data = (; results, abs_errors, x_vals, alphas, labels, x_vals2, alphas2)

    fig = Figure(; size=(1024, 512), title="$model_type vs HF (σ = $sigma_test)", titlesize=25)
    axis_common = (; xlabelsize=20, ylabelsize=20, titlesize=20, xticklabelsize=20, yticklabelsize=20)

    axs1 = draw!(
        fig[1, 1],
        AoG.data(plot_data) *
        mapping(:x_vals => L"x", :results => L"u(x, t)"; color=:labels => "", col=:alphas => "", linestyle=:labels => "") *
        visual(Lines; linewidth=4),
        scales(; Color=(; palette=[:orange, :blue]), LineStyle=(; palette=[:solid, :dash]));
        axis=merge(axis_common, (; xlabel=""))
    )
    for ax in axs1
        hidexdecorations!(ax; grid=false)
    end
    axislegend(axs1[1, 1].axis, [LineElement(; linestyle=:solid, color=:orange), LineElement(; linestyle=:dash, color=:blue)], ["High-Fidelity", model_type], position=:lt)

    axs2 = draw!(
        fig[2, 1],
        AoG.data(plot_data) * mapping(:x_vals2 => L"x", :abs_errors => L"|u_{pred} - u_{true}|"; col=:alphas2 => "") * visual(Lines; linewidth=4, color=:green);
        axis=merge(axis_common, (; titlevisible=false))
    )

    mkpath(plotsdir(lowercase(model_type)))
    save(save_path, fig)
    HashRegistry.update_registry!("evaluations", eval_hash, config)

    println("Evaluation successful! Plot saved to: $save_path")

    return eval_hash
end


# ----------------- SPECIALIZED DISPATCH -------------------------

"""
    evaluate_and_predict(model::DeepONet, weights_data, fem_data, model_config, sigma_test)

Specialized dispatch for formatting inputs, compiling XLA graph, and executing
DeepONet inference.
"""
function evaluate_and_predict(model::ModelTypes.DeepONet, weights_data::AbstractDict, fem_data::AbstractDict, model_config::AbstractDict, sigma_test::Float64)
    fem_config = fem_data["config"]
    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    N_x = length(x_grid)
    N_t = length(t_grid)

    m_sensors = model_config["m_sensors"]

    deepONet, x_sensors = DeepONetArch.build_deeponet(
        m_sensors=m_sensors,
        p_latent=model_config["p_latent"],
        hidden=model_config["hidden"],
        L=fem_config["L"]
    )

    ps_dev = weights_data["ps"] |> XDEV
    st_dev = weights_data["st"] |> XDEV
    max_u = weights_data["max_u"]

    # Format Inputs
    f_test_cpu = zeros(Float32, m_sensors, 1)
    pi_f32 = Float32(π)
    u₀(x) = (1.0f0 / √(2.0f0 * pi_f32 * Float32(sigma_test))) * exp(-x^2 / (2.0f0 * Float32(sigma_test)))
    f_test_cpu[:, 1] .= Float32.(u₀.(x_sensors))

    x_flat = repeat(x_grid, outer=N_t)
    t_flat = repeat(t_grid, inner=N_x)
    x_test_cpu = Float32.(vcat(x_flat', t_flat'))

    f_test_dev = f_test_cpu |> XDEV
    x_test_dev = x_test_cpu |> XDEV

    println("Compiling DeepONet inference graph for XLA...")

    function deeponet_closure(f_in, x_in, p, s)
        pred, _ = deepONet((f_in, x_in), p, s)
        return pred
    end

    compiled_predict = Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
        @compile deeponet_closure(f_test_dev, x_test_dev, ps_dev, st_dev)
    end

    _ = compiled_predict(f_test_dev, x_test_dev, ps_dev, st_dev)

    println("Running Neural Operator inference...")
    t_nn = @elapsed begin
        u_pred_dev = compiled_predict(f_test_dev, x_test_dev, ps_dev, st_dev)
        u_pred_cpu = u_pred_dev |> CDEV
    end

    u_pred_cpu .*= max_u
    u_pred_matrix = reshape(vec(u_pred_cpu), N_x, N_t)

    return u_pred_matrix, t_grid, t_nn
end

"""
    evaluate_and_predict(model::FNO, weights_data, fem_data, model_config, sigma_test)

Specialized dispatch for FNO inference. Demonstrates Super-Resolution by
evaluating on the full physical grid (`N_x_full`) natively.
"""
function evaluate_and_predict(model::ModelTypes.FNO, weights_data::AbstractDict, fem_data::AbstractDict, model_config::AbstractDict, sigma_test::Float64)
    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    N_x_full = length(x_grid)
    N_t_full = length(t_grid)

    # Calculate time reduction indices to match training shape
    if haskey(model_config, "nt_red")
        nt_red = model_config["nt_red"]
        idx_t = round.(Int, range(1, N_t_full, length=nt_red))
    else
        step_t = model_config["step_t"]
        idx_t = 1:step_t:N_t_full
        nt_red = length(idx_t)
    end
    t_grid_pred = t_grid[idx_t]

    # Convert JSON vectors to Tuple
    hidden_channels_tuple = Tuple(model_config["hidden_channels"])
    modes_tuple = Tuple(model_config["modes"])

    fno = FNOArch.build_fno(
        in_channels=1,
        out_channels=nt_red,
        hidden_channels=hidden_channels_tuple,
        modes=modes_tuple
    )

    ps_dev = weights_data["ps"] |> XDEV
    st_dev = weights_data["st"] |> XDEV
    max_u = weights_data["max_u"]

    # FNO Input (N_x_full, 1_channel, 1_batch)
    u_in_test = zeros(Float32, N_x_full, 1, 1)
    pi_f32 = Float32(π)
    u_init(x) = (1.0f0 / √(2.0f0 * pi_f32 * Float32(sigma_test))) * exp(-x^2 / (2.0f0 * Float32(sigma_test)))
    u_in_test[:, 1, 1] .= Float32.(u_init.(x_grid))

    u_in_test ./= max_u
    u_in_test_dev = u_in_test |> XDEV

    println("Compiling FNO inference graph for XLA...")

    # We define a specialized closure that "captures" the fno struct statically.
    # XLA will only trace the dynamic tensors: x, p, and s.
    function fno_closure(x, p, s)
        pred, _ = fno(x, p, s)
        return pred
    end

    compiled_predict = Reactant.with_config(;
        convolution_precision=PrecisionConfig.HIGH,
        dot_general_precision=PrecisionConfig.HIGH,
    ) do
        @compile fno_closure(u_in_test_dev, ps_dev, st_dev)
    end

    _ = compiled_predict(u_in_test_dev, ps_dev, st_dev)

    println("Running Neural Operator inference...")
    t_nn = @elapsed begin
        u_pred_dev = compiled_predict(u_in_test_dev, ps_dev, st_dev)
        u_pred_cpu = u_pred_dev |> CDEV
    end

    u_pred_cpu .*= max_u
    # Extract the first (and only) batch. Resulting shape: (N_x_full, nt_red)
    u_pred_matrix = u_pred_cpu[:, :, 1]

    return u_pred_matrix, t_grid_pred, t_nn
end


# ------------------ PUBLIC API -----------------------

"""
    run_plot(model::DeepONet; model_hash::String, kwargs...)

Evaluates a trained DeepONet model on an unseen parameter (Zero-Shot execution),
benchmarks its inference time against the Gridap FEM solver, and generates
a comparative plot.

# Required Arguments
- `model_hash::String`: The 12-character SHA-256 hash of the trained model.

# Keyword Arguments
- `sigma_test::Float64=0.03`: The unseen standard deviation to evaluate the model on.

# Output
- Saves a comparative visualization to `plots/deeponet/eval_<eval_hash>.png`.
- Updates `data/registry.json` under the "evaluations" category.
- **Returns:** `eval_hash::String` confirming successful plot generation.
"""
function run_plot(model::ModelTypes.DeepONet;
    model_hash::String,
    sigma_test::Float64=0.03
)
    config = @strdict(model_hash, sigma_test)
    return execute_plot_pipeline(model, config)
end

"""
    run_plot(model::FNO; model_hash::String, kwargs...)

Evaluates a trained FNO model on an unseen parameter (Zero-Shot execution),
benchmarks its inference time against the Gridap FEM solver, and generates
a comparative plot. Highlights FNO's zero-shot super-resolution.

# Required Arguments
- `model_hash::String`: The 12-character SHA-256 hash of the trained model.

# Keyword Arguments
- `sigma_test::Float64=0.03`: The unseen standard deviation to evaluate the model on.

# Output
- Saves a comparative visualization to `plots/fno/eval_<eval_hash>.png`.
- Updates `data/registry.json` under the "evaluations" category.
- **Returns:** `eval_hash::String` confirming successful plot generation.
"""
function run_plot(model::ModelTypes.FNO;
    model_hash::String,
    sigma_test::Float64=0.03
)
    config = @strdict(model_hash, sigma_test)
    return execute_plot_pipeline(model, config)
end

# Executed only when run from bash terminal
if abspath(PROGRAM_FILE) == @__FILE__
    # Requires an explicitly passed model_hash from terminal to work properly.
    h_val = length(ARGS) > 0 ? ARGS[1] : "hash"
    s_val = length(ARGS) > 1 ? parse(Float64, ARGS[2]) : 0.03

    run_plot(ModelTypes.DeepONet(); model_hash=h_val, sigma_test=s_val)
end
