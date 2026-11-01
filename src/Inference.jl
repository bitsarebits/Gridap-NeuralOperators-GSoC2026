module Inference

using Lux, Reactant, Statistics

# Custom modules
using ..Solvers, ..DeepONetArch, ..FNOArch, ..NOMADArch, ..Utils

export evaluate_and_predict, clear_compiled_cache!

# Thread-safe cache for compiled XLA inference executables
const COMPILED_CACHE = Dict{Any,Any}()
const COMPILED_CACHE_LOCK = ReentrantLock()

"""
    clear_compiled_cache!()

Clears the in-memory cache of compiled XLA inference graphs.
"""
function clear_compiled_cache!()
    lock(COMPILED_CACHE_LOCK) do
        empty!(COMPILED_CACHE)
    end
    return nothing
end

"""
    evaluate_and_predict(solver::DeepONetSolver, weights_data::AbstractDict, fem_data::AbstractDict, sigma_test::Float64)

Specialized dispatch for formatting inputs, compiling XLA graph, and executing
DeepONet inference.

# Arguments
- `solver::DeepONetSolver`: The DeepONet solver instance containing architectural parameters.
- `weights_data::AbstractDict`: Dictionary containing the trained model weights (`ps`, `st`).
- `fem_data::AbstractDict`: Dictionary containing the original FEM data and configuration.
- `sigma_test::Float64`: The unseen standard deviation to evaluate the model on.
"""
function evaluate_and_predict(solver::DeepONetSolver, weights_data::AbstractDict, fem_data::AbstractDict, sigma_test::Float64)
    fem_config = fem_data["config"]
    L=fem_config["L"]

    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    N_x = length(x_grid)
    N_t = length(t_grid)

    m_sensors = solver.m_sensors

    deepONet, x_sensors = DeepONetArch.build_deeponet(
        m_sensors=m_sensors,
        p_latent=solver.p_latent,
        hidden=solver.hidden,
        L=L
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

    cache_key = (:DeepONet, m_sensors, solver.p_latent, solver.hidden, L, N_x, N_t)
    compiled_predict = lock(COMPILED_CACHE_LOCK) do
        get(COMPILED_CACHE, cache_key, nothing)
    end

    if isnothing(compiled_predict)
        println("Compiling DeepONet inference graph for XLA...")
        function deeponet_closure(f_in, x_in, p, s)
            pred, _ = deepONet((f_in, x_in), p, s)
            return pred
        end

        compiled_predict = Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
            @compile sync=true deeponet_closure(f_test_dev, x_test_dev, ps_dev, st_dev)
        end

        lock(COMPILED_CACHE_LOCK) do
            COMPILED_CACHE[cache_key] = compiled_predict
        end
    else
        println("Reusing cached XLA inference graph for DeepONet...")
    end

    # Warm up once, then measure synchronous model execution only.
    _ = compiled_predict(f_test_dev, x_test_dev, ps_dev, st_dev)
    println("Running Neural Operator inference (5 synchronous repetitions)...")
    timings = Float64[]
    last_pred_dev = nothing
    for _ in 1:5
        elapsed = @elapsed begin
            last_pred_dev = compiled_predict(f_test_dev, x_test_dev, ps_dev, st_dev)
        end
        push!(timings, elapsed)
    end
    t_nn = median(timings)
    u_pred_cpu = last_pred_dev |> CDEV

    u_pred_cpu .*= max_u
    u_pred_matrix = reshape(vec(u_pred_cpu), N_x, N_t)

    return u_pred_matrix, t_grid, t_nn
end

"""
    evaluate_and_predict(solver::FNOSolver, weights_data::AbstractDict, fem_data::AbstractDict, sigma_test::Float64)

Specialized dispatch for FNO inference. Demonstrates Super-Resolution by
evaluating on the full physical grid (`N_x_full`) natively.

# Arguments
- `solver::FNOSolver`: The FNO solver instance containing architectural parameters.
- `weights_data::AbstractDict`: Dictionary containing the trained model weights (`ps`, `st`).
- `fem_data::AbstractDict`: Dictionary containing the original FEM data and configuration.
- `sigma_test::Float64`: The unseen standard deviation to evaluate the model on.
"""
function evaluate_and_predict(solver::FNOSolver, weights_data::AbstractDict, fem_data::AbstractDict, sigma_test::Float64)
    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    N_x_full = length(x_grid)
    N_t_full = length(t_grid)

    # Calculate time reduction indices to match training shape
    nt_red = solver.nt_red
    idx_t = round.(Int, range(1, N_t_full, length=nt_red))
    t_grid_pred = t_grid[idx_t]

    fno = FNOArch.build_fno(
        in_channels=1,
        out_channels=nt_red,
        hidden_channels=solver.hidden_channels,
        modes=solver.modes
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

    cache_key = (:FNO, nt_red, solver.hidden_channels, solver.modes, N_x_full)
    compiled_predict = lock(COMPILED_CACHE_LOCK) do
        get(COMPILED_CACHE, cache_key, nothing)
    end

    if isnothing(compiled_predict)
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
            @compile sync=true fno_closure(u_in_test_dev, ps_dev, st_dev)
        end

        lock(COMPILED_CACHE_LOCK) do
            COMPILED_CACHE[cache_key] = compiled_predict
        end
    else
        println("Reusing cached XLA inference graph for FNO...")
    end

    _ = compiled_predict(u_in_test_dev, ps_dev, st_dev)
    println("Running Neural Operator inference (5 synchronous repetitions)...")
    timings = Float64[]
    last_pred_dev = nothing
    for _ in 1:5
        elapsed = @elapsed begin
            last_pred_dev = compiled_predict(u_in_test_dev, ps_dev, st_dev)
        end
        push!(timings, elapsed)
    end
    t_nn = median(timings)
    u_pred_cpu = last_pred_dev |> CDEV

    u_pred_cpu .*= max_u
    # Extract the first (and only) batch. Resulting shape: (N_x_full, nt_red)
    u_pred_matrix = u_pred_cpu[:, :, 1]

    return u_pred_matrix, t_grid_pred, t_nn
end

"""
    evaluate_and_predict(solver::NOMADSolver, weights_data::Dict, fem_data::Dict, sigma_test::Float64)
"""
function evaluate_and_predict(
    solver::NOMADSolver,
    weights_data::AbstractDict,
    fem_data::AbstractDict,
    sigma_test::Float64
)
    ps = weights_data["ps"] |> XDEV
    st = weights_data["st"] |> XDEV
    max_u = weights_data["max_u"]

    nomad_net = NOMADArch.build_nomad(
        m_sensors=solver.m_sensors,
        p_latent=solver.p_latent,
        hidden=solver.hidden
    )

    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    fem_config = fem_data["config"]
    N_x = length(x_grid)
    N_t = length(t_grid)

    L = fem_config["L"]
    x_sensors = range(-L, L, length=solver.m_sensors)
    pi_f32 = Float32(π)
    u₀(x) = (1.0f0 / √(2.0f0 * pi_f32 * Float32(sigma_test))) * exp(-x^2 / (2.0f0 * Float32(sigma_test)))
    f_in = Float32.(u₀.(x_sensors)) ./ max_u
    u_test_dev = repeat(f_in, 1, N_x) |> XDEV

    # Compile using one representative time slice, then reuse the same compiled
    # graph for every timestep. This removes per-step JIT compilation from timing.
    first_y_dev = Float32.(vcat(x_grid', fill(Float32(first(t_grid)), 1, N_x))) |> XDEV

    cache_key = (:NOMAD, solver.m_sensors, solver.p_latent, solver.hidden, N_x)
    compiled_predict = lock(COMPILED_CACHE_LOCK) do
        get(COMPILED_CACHE, cache_key, nothing)
    end

    if isnothing(compiled_predict)
        println("Compiling NOMAD inference graph for XLA...")
        function nomad_closure(u_in, y_in, p, s)
            pred, _ = nomad_net((u_in, y_in), p, s)
            return pred
        end

        compiled_predict = Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
            @compile sync=true nomad_closure(u_test_dev, first_y_dev, ps, st)
        end

        lock(COMPILED_CACHE_LOCK) do
            COMPILED_CACHE[cache_key] = compiled_predict
        end
    else
        println("Reusing cached XLA inference graph for NOMAD...")
    end

    _ = compiled_predict(u_test_dev, first_y_dev, ps, st) # warm-up

    u_pred_matrix = zeros(Float32, N_x, N_t)
    timings = zeros(Float64, 5)

    # Preserve the low-memory, one-timestep-at-a-time strategy. Input staging
    # and output copies happen outside the timed region for consistency with
    # DeepONet and FNO; each compiled forward pass is synchronously timed.
    Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
        for (t_idx, t) in enumerate(t_grid)
            y_test_dev = Float32.(vcat(x_grid', fill(Float32(t), 1, N_x))) |> XDEV
            last_pred_dev = nothing

            for repetition in eachindex(timings)
                elapsed = @elapsed begin
                    last_pred_dev = compiled_predict(u_test_dev, y_test_dev, ps, st)
                end
                timings[repetition] += elapsed
            end

            pred_cpu = last_pred_dev |> CDEV
            u_pred_matrix[:, t_idx] .= vec(pred_cpu) .* max_u
        end
    end

    return u_pred_matrix, t_grid, median(timings)
end

end # module
