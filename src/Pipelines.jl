module Pipelines

using DrWatson, JLD2, JSON3, Statistics, Gridap

# Custom modules
using ..TrainingLoops, ..Solvers, ..DataGeneration, ..HashRegistry, ..Inference, ..Utils, ..LRSchedulers

export execute_train_pipeline, execute_plot_pipeline

# Increment this when evaluation metrics or timing semantics change. Including it
# in the evaluation hash prevents stale cached reports from being reused.
const EVALUATION_BENCHMARK_VERSION = 2

# Helpers

@inline function _compact_val(x::Real; digits::Int=4, tol::Float32=5f-5)
    fx = Float32(x)
    return abs(fx) < tol ? 0.0f0 : round(fx; digits=digits)
end

_compact_vec(v::AbstractVector; digits::Int=4, tol::Float32=5f-5) =
    [_compact_val(x; digits=digits, tol=tol) for x in v]

_compact_mat(slices::AbstractVector; digits::Int=4, tol::Float32=5f-5) =
    [_compact_vec(s; digits=digits, tol=tol) for s in slices]

function _compact_loss_history(loss_history::AbstractVector, max_points::Int=500)
    n = length(loss_history)
    n == 0 && return Any[]
    step = max(1, cld(n, max_points))
    idx = unique(vcat(1:step:n, n))
    return [
        Dict(
            "epoch" => Int(loss_history[i]["epoch"]),
            "loss" => signif_loss(loss_history[i]["loss"])
        ) for i in idx
    ]
end
@inline signif_loss(x::Real) = round(Float64(x); sigdigits=4)

function model_config_for_hash(
    solver::AbstractNeuralSolver,
    data_hash::String,
)
    solver_config = HashRegistry.struct_to_dict(solver)
    scheduler_config = solver_config["lr_scheduler"]

    # Exclude runtime state from the model identity.
    pop!(scheduler_config, "wait", nothing)
    pop!(scheduler_config, "best_loss", nothing)

    # Persist the scheduler type as part of the canonical configuration.
    scheduler_config["type"] = string(nameof(typeof(solver.lr_scheduler)))

    return Dict(
        "solver_type" => get_solver_name(solver),
        "solver" => solver_config,
        "data_hash" => data_hash,
    )
end

function evaluation_config_for_hash(
    model_hash::String,
    eval_config::EvalConfig,
)
    return Dict(
        "model_hash" => model_hash,
        "eval_config" => HashRegistry.struct_to_dict(eval_config),
        "benchmark_version" => EVALUATION_BENCHMARK_VERSION,
    )
end

"""Linearly interpolate a spatial-by-time prediction matrix onto a target time grid."""
function interpolate_time_grid(
    u_pred::AbstractMatrix,
    t_source::AbstractVector,
    t_target::AbstractVector,
)
    size(u_pred, 2) == length(t_source) ||
        throw(ArgumentError("Prediction columns must match the source time grid."))
    if length(t_source) == 1
        length(t_target) == 1 && return Float64.(u_pred)
        throw(ArgumentError("At least two prediction time points are required for interpolation."))
    end
    all(diff(t_source) .> 0) ||
        throw(ArgumentError("Prediction time grid must be strictly increasing."))

    tolerance = 1e-10 * max(1.0, abs(Float64(first(t_source))), abs(Float64(last(t_source))))
    (minimum(t_target) >= first(t_source) - tolerance &&
        maximum(t_target) <= last(t_source) + tolerance) ||
        throw(ArgumentError("Prediction time grid does not cover the full FEM evaluation grid."))

    result = Matrix{Float64}(undef, size(u_pred, 1), length(t_target))
    source_times = Float64.(t_source)
    target_times = Float64.(t_target)
    source_values = Float64.(u_pred)

    for (j, t) in enumerate(target_times)
        if t <= source_times[1]
            result[:, j] .= source_values[:, 1]
        elseif t >= source_times[end]
            result[:, j] .= source_values[:, end]
        else
            left = searchsortedlast(source_times, t)
            if source_times[left] == t
                result[:, j] .= source_values[:, left]
            else
                right = left + 1
                weight = (t - source_times[left]) / (source_times[right] - source_times[left])
                result[:, j] .= source_values[:, left] .+
                    weight .* (source_values[:, right] .- source_values[:, left])
            end
        end
    end

    return result
end

"""
    execute_train_pipeline(solver::AbstractNeuralSolver, data_hash::String; log_cb)

Handles cache validation, loading the High-Fidelity dataset, triggering the specialized
training dispatch (via `prepare_and_train`), and saving the resulting weights and loss history to disk.
# Arguments
- `solver`: An instance of a concrete neural solver type (e.g., `DeepONetSolver()`).
- `data_hash::String`: The unique hash identifier of the source FEM dataset.

# kwargs
- `log_cb`: callback function to send log to the frontend

# Returns
- `model_hash::String`: The unique hash identifier of the trained model.
"""
function execute_train_pipeline(
    solver::AbstractNeuralSolver,
    data_hash::String
    ;
    log_cb=(x)->nothing,
    should_stop=()->false,
)
    solver_name = get_solver_name(solver)

    # Architectural Integrity Check for Fine-Tuning
    if solver.pretrained_model_hash != ""
        parent_hash = solver.pretrained_model_hash
        registry = HashRegistry.load_registry()

        if !haskey(registry["models"], parent_hash)
            error("Cannot fine-tune: Parent model hash [$parent_hash] not found in the registry.")
        end

        parent_model_entry = registry["models"][parent_hash]

        parent_solver = parent_model_entry["solver"]
        parent_type = parent_model_entry["solver_type"]

        # Verify Model Type
        if lowercase(parent_type) != lowercase(solver_name)
            error("Architecture mismatch! Cannot fine-tune a $(parent_type) into a $solver_name.")
        end

        # Validate architecture fields against the canonical model registry entry
        if solver isa DeepONetSolver || solver isa NOMADSolver
            if parent_solver["m_sensors"] != solver.m_sensors ||
                parent_solver["p_latent"] != solver.p_latent ||
                parent_solver["hidden"] != solver.hidden ||
                parent_solver["step_x"] != solver.step_x ||
                parent_solver["step_t"] != solver.step_t
                error("Architecture mismatch! m_sensors, p_latent, hidden, step_x and step_t must exactly match the pre-trained model.")
            end
        elseif solver isa FNOSolver
            if parent_solver["nx_red"] != solver.nx_red ||
                parent_solver["nt_red"] != solver.nt_red
                error("Architecture mismatch! FNO grid resolution (nx_red, nt_red) must exactly match the pre-trained model.")
            end
        end

        println("Architecture verified. Valid fine-tuning request for parent hash: [$parent_hash]")
    end

    # Build a deterministic model configuration without runtime scheduler state.
    solver_config = HashRegistry.struct_to_dict(solver)

    scheduler_config = solver_config["lr_scheduler"]

    # These fields describe the scheduler's runtime state, not its configuration.
    pop!(scheduler_config, "wait", nothing)
    pop!(scheduler_config, "best_loss", nothing)

    # Store the concrete scheduler type as part of the configuration.
    scheduler_config["type"] = string(nameof(typeof(solver.lr_scheduler)))

    config_dict = model_config_for_hash(solver, data_hash)
    model_hash = HashRegistry.config_hash(config_dict)
    weights_path = datadir("models", lowercase(solver_name), "model_$(model_hash).jld2")

    # Cache check
    if HashRegistry.check_registry("models", model_hash) && isfile(weights_path)
        println("Model already trained with Hash: [$model_hash]. Skipping training.")
        return model_hash
    end


    # Load FEM Data generated by GridapROMs
    println("--- Training New Model (Hash: $model_hash) on Data ($data_hash) ---")
    should_stop() && throw(InterruptException())
    log_cb(Dict("type" => "status", "stage" => "Loading FEM Data into RAM..."))
    data_path = datadir("sims", "data_$(data_hash).jld2")
    if !isfile(data_path)
        error("Required data hash [$data_hash] not found! Run generation first.")
    end

    fem_data = load(data_path)

    # Get the scheduler from the struct
    lr_scheduler = init_scheduler(solver.lr_scheduler, solver.epochs)

    # Delegate to specialized Dispatch
    log_cb(Dict("type" => "status", "stage" => "Formatting tensors and moving to XLA Device..."))
    ps_cpu, st_cpu, max_u, loss_history =
        prepare_and_train(solver, fem_data, lr_scheduler; log_cb=log_cb, should_stop=should_stop)

    should_stop() && throw(InterruptException())

    # Save Model Weights and Update Registry
    log_cb(Dict("type" => "status", "stage" => "Saving trained weights to disk..."))
    mkpath(datadir("models", lowercase(solver_name)))
    jldsave(weights_path; ps=ps_cpu, st=st_cpu, max_u=max_u, loss_history=loss_history)

    HashRegistry.update_registry!("models", model_hash, config_dict)

    println("Model weights saved to $weights_path")
    println("$(solver_name) integration script finished successfully")

    return model_hash
end

"""
    execute_plot_pipeline(solver::AbstractNeuralSolver, model_hash::String, eval_config::EvalConfig; log_cb)

Executes zero-shot evaluation across the entire spatio-temporal grid, computes time-resolved
and global error metrics, and serializes the interactive evaluation payload to JSON.

# Arguments
- `solver`: An instance of a concrete neural solver type (e.g., `DeepONetSolver()`).
- `model_hash::String`: The unique hash identifier of the trained model.
- `eval_config::EvalConfig`: A struct containing evaluation parameters like `sigma_test`.

# kwargs
- `log_cb`: callback function to send log to the frontend

# Returns
- `eval_hash::String`: The unique hash identifier of the evaluation.
"""
function execute_plot_pipeline(
    solver::AbstractNeuralSolver,
    model_hash::String,
    eval_config::EvalConfig
    ;
    log_cb=(x)->nothing
)
    solver_name = get_solver_name(solver)
    sigma_test = eval_config.sigma_test

    config_dict = evaluation_config_for_hash(model_hash, eval_config)
    eval_hash = HashRegistry.config_hash(config_dict)
    save_path = plotsdir(lowercase(solver_name), "eval_$(eval_hash).json")

    if HashRegistry.check_registry("evaluations", eval_hash) && isfile(save_path)
        msg = "Interactive evaluation already exists for Hash: [$eval_hash]. Skipping evaluation."
        println(msg)
        log_cb(Dict("type" => "status", "stage" => msg))
        return eval_hash
    end

    # Extract Registry and Metadata
    registry = HashRegistry.load_registry()
    if !haskey(registry["models"], model_hash)
        error("Model hash [$model_hash] not found in registry.")
    end

    model_config = registry["models"][model_hash]
    data_hash = model_config["data_hash"]

    log_cb(Dict("type" => "status", "stage" => "Starting $solver_name Zero-Shot Evaluation..."))
    println("--- Starting $solver_name Zero-Shot Evaluation (Eval Hash: $eval_hash) ---")
    println("Evaluating unseen parameter: σ = $sigma_test")

    # Load Dependencies
    weights_path = datadir("models", lowercase(solver_name), "model_$(model_hash).jld2")
    weights_data = load(weights_path)

    data_path = datadir("sims", "data_$(data_hash).jld2")
    fem_data = load(data_path)

    # Build the FEMConfig from the dataset dictionary
    fem_config = FEMConfig(; (Symbol(k) => v for (k, v) in fem_data["config"])...)

    # Execute High-Fidelity FEM
    log_cb(Dict("type" => "status", "stage" => "Warmup: Compiling Gridap solvers..."))
    println("\nWARMUP PHASE: Compiling Gridap (This will take a moment)")
    _ = DataGeneration.generate_fem_snapshots([[sigma_test]], fem_config)

    log_cb(Dict("type" => "status", "stage" => "Computing High-Fidelity FEM benchmark for σ = $sigma_test..."))
    println("\nBENCHMARK PHASE: Measuring FEM execution time (5 repetitions)...")
    println("Generating High-Fidelity FEM solution for σ = $sigma_test...")
    fem_timings = Float64[]
    hf_results = nothing
    for _ in 1:5
        elapsed = @elapsed begin
            hf_results = DataGeneration.generate_fem_snapshots([[sigma_test]], fem_config)
        end
        push!(fem_timings, elapsed)
    end
    t_fem = median(fem_timings)
    x_hf_raw = hf_results.snapshots[:, 1, :]

    # Specialized Neural Inference Dispatch
    log_cb(Dict("type" => "status", "stage" => "Running Neural Operator Inference via XLA..."))
    u_pred_matrix, t_grid_pred, t_nn = evaluate_and_predict(
        solver, weights_data, fem_data, sigma_test
    )

    # Compute the ratio from unrounded measurements; round only for display.
    speedup = round(t_fem / max(t_nn, eps(Float64)), digits=2)

    println("\n=== BENCHMARK RESULTS (σ = $sigma_test) ===")
    println("FEM Computation Time:  $(round(t_fem, digits=4)) seconds")
    println("$solver_name Inference:    $(round(t_nn, digits=4)) seconds")
    println("Speedup Factor:        $(speedup)x")
    println("====================================\n")

    # Plotting Generation
    log_cb(Dict("type" => "status", "stage" => "Computing full spatio-temporal metrics and serializing interactive payload..."))

    x_grid = Float32.(fem_data["x_grid"])
    t_grid_eval = Float64.(fem_data["t_grid"])
    N_x = length(x_grid)
    N_t_plot = length(t_grid_eval)

    # Evaluate every architecture on the same full FEM time grid. FNO predicts
    # only nt_red snapshots, so interpolate its prediction in time before scoring.
    u_pred_eval = interpolate_time_grid(u_pred_matrix, t_grid_pred, t_grid_eval)

    # Keep full precision for metrics; round only the display tensors/curves below.
    u_true_slices = Vector{Vector{Float32}}(undef, N_t_plot)
    u_pred_slices = Vector{Vector{Float32}}(undef, N_t_plot)
    rel_l2_t_raw = zeros(Float64, N_t_plot)
    linf_t_raw = zeros(Float64, N_t_plot)

    for k in 1:N_t_plot
        u_t_raw = Float64.(x_hf_raw[:, k])
        u_p_raw = Float64.(vec(u_pred_eval[:, k]))
        diff_raw = u_p_raw .- u_t_raw

        l2_err = sqrt(mean(abs2, diff_raw))
        denom = max(sqrt(mean(abs2, u_t_raw)), 1e-8)
        rel_l2_t_raw[k] = (l2_err / denom) * 100.0
        linf_t_raw[k] = maximum(abs, diff_raw)

        u_true_slices[k] = Float32.(u_t_raw)
        u_pred_slices[k] = Float32.(u_p_raw)
    end

    mean_rel_l2 = mean(rel_l2_t_raw)
    max_rel_l2 = maximum(rel_l2_t_raw)
    worst_t_idx = Int(argmax(rel_l2_t_raw)) - 1 # 0-based index for JS frontend
    global_linf = maximum(linf_t_raw)

    vis_step = max(1, fem_config.order)
    vis_idx = 1:vis_step:N_x
    x_grid_vis = x_grid[vis_idx]

    u_true_slices = Vector{Vector{Float32}}(undef, N_t_plot)
    u_pred_slices = Vector{Vector{Float32}}(undef, N_t_plot)

    for k in 1:N_t_plot
        u_true_slices[k] = Float32.(@view x_hf_raw[vis_idx, k])
        u_pred_slices[k] = Float32.(@view u_pred_eval[vis_idx, k])
    end

    x_sensors_vis = if solver isa DeepONetSolver || solver isa NOMADSolver
        _compact_vec(collect(range(-fem_config.L, fem_config.L, length=solver.m_sensors)); digits=4, tol=1f-7)
    elseif solver isa FNOSolver
        idx_fno = round.(Int, range(1, N_x, length=solver.nx_red))
        _compact_vec(x_grid[idx_fno]; digits=4, tol=1f-7)
    else
        Float32[]
    end

    raw_loss_history = get(weights_data, "loss_history", Any[])

    eval_payload = Dict(
        "eval_hash" => eval_hash,
        "benchmark_version" => EVALUATION_BENCHMARK_VERSION,
        "model_hash" => model_hash,
        "data_hash" => data_hash,
        "solver_name" => replace(solver_name, "Solver" => ""),
        "x_grid" => _compact_vec(x_grid_vis; digits=4, tol=1f-7),
        "t_grid" => _compact_vec(t_grid_eval; digits=4, tol=1f-7),
        "x_sensors" => x_sensors_vis,
        "u_true" => _compact_mat(u_true_slices; digits=4, tol=5f-5),
        "u_pred" => _compact_mat(u_pred_slices; digits=4, tol=5f-5),
        "rel_l2_t" => _compact_vec(rel_l2_t_raw; digits=4, tol=1f-7),
        "linf_t" => _compact_vec(linf_t_raw; digits=6, tol=1f-8),
        "loss_history" => _compact_loss_history(raw_loss_history),
        "benchmark_protocol" => Dict(
            "version" => EVALUATION_BENCHMARK_VERSION,
            "fem_timing" => "Median of 5 FEM runs after one compilation warm-up.",
            "inference_timing" => "Median of 5 synchronous model forward passes; excludes compilation and host/device transfers.",
            "evaluation_time_grid" => "Full FEM time grid; linearly interpolated when the model predicts on a reduced time grid.",
        ),
        "metrics" => Dict(
            "t_fem" => t_fem,
            "t_nn" => t_nn,
            "speedup" => speedup,
            "mean_rel_l2" => mean_rel_l2,
            "max_rel_l2" => max_rel_l2,
            "worst_t_idx" => worst_t_idx,
            "linf_error" => global_linf,
            "nx" => N_x,
            "nt" => N_t_plot,
            "sigma_test" => sigma_test
        )
    )

    mkpath(plotsdir(lowercase(solver_name)))
    open(save_path, "w") do io
        JSON3.write(io, eval_payload)
    end
    HashRegistry.update_registry!("evaluations", eval_hash, config_dict)

    log_cb(Dict("type" => "status", "stage" => "Evaluation successful! Interactive data ready."))
    println("Evaluation successful! Interactive JSON saved to: $save_path")

    return eval_hash
end

end
