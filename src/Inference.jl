module Inference

using Lux, Reactant

# Custom modules
using ..Solvers, ..DeepONetArch, ..FNOArch, ..Utils

export evaluate_and_predict


"""
    evaluate_and_predict(model::DeepONet, weights_data, fem_data, model_config, sigma_test)

Specialized dispatch for formatting inputs, compiling XLA graph, and executing
DeepONet inference.
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

end # module
