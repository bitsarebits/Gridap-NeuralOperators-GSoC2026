module Inference

using Lux, Reactant

# Custom modules
using ..Solvers, ..DeepONetArch, ..FNOArch, ..NOMADArch, ..Utils

export evaluate_and_predict


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

"""
    evaluate_and_predict(solver::NOMADSolver, weights_data::Dict, fem_data::Dict, sigma_test::Float64)
"""
function evaluate_and_predict(
    solver::NOMADSolver,
    weights_data::Dict,
    fem_data::Dict,
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

    x_sensors = range(-fem_config["L"]/2, fem_config["L"]/2, length=solver.m_sensors)
    pi_f32 = Float32(π)
    u₀(x) = (1.0f0 / √(2.0f0 * pi_f32 * Float32(sigma_test))) * exp(-x^2 / (2.0f0 * Float32(sigma_test)))
    f_in = Float32.(u₀.(x_sensors))

    u_pred_matrix = zeros(Float32, N_x, N_t)

    t_nn = @elapsed begin
        Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
            # Process one timestep at a time to keep VRAM usage low
            for (t_idx, t) in enumerate(t_grid)

                # Repeat the sensor array for every x coordinate in this time step
                u_test = repeat(f_in, 1, N_x) |> XDEV

                # Create the spatial-temporal coordinates for the whole grid at time t
                y_test = Float32.(vcat(x_grid', fill(Float32(t), 1, N_x))) |> XDEV

                pred_dev = @jit(nomad_net((u_test, y_test), ps, st))
                pred_cpu = first(pred_dev) |> CDEV

                u_pred_matrix[:, t_idx] .= vec(pred_cpu) .* max_u
            end
        end
    end

    return u_pred_matrix, t_grid, t_nn
end

end # module
