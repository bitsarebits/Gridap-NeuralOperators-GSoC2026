module TrainingLoops

using Lux, Reactant, Enzyme, Optimisers, Random, Statistics, MLUtils

# Custom modules
using ..Solvers, ..DeepONetArch, ..FNOArch, ..Utils, ..LRSchedulers

export train_deeponet!, train_fno!, prepare_and_train

# Helper
"""
    format_eta(eta_seconds::Real) -> String

Formats a duration in seconds into a human-readable HH:MM:SS or MM:SS string.
"""
function format_eta(eta_seconds::Real)
    eta_sec = round(Int, eta_seconds)
    h = div(eta_sec, 3600)
    m = div(rem(eta_sec, 3600), 60)
    s = rem(eta_sec, 60)

    if h > 0
        return "$(lpad(h, 2, '0')):$(lpad(m, 2, '0')):$(lpad(s, 2, '0'))"
    else
        return "$(lpad(m, 2, '0')):$(lpad(s, 2, '0'))"
    end
end

# ------------- TRAINING FUNCTIONS --------------

"""
    train_deeponet!(train_state, data; epochs=5000)

Executes the training loop for the DeepONet model.
The function expects an already initialized `TrainState`.
Note: The first epoch will trigger the XLA and Enzyme JIT compilation,
which usually takes a few minutes. After that epochs will be extremely fast.

# Arguments
- `train_state`: already initialized `TrainState`.
- `data`: A tuple containing the formatted training data `((f_data, x_data), u_data)`.
- `lr_scheduler`: An instantiated scheduler (e.g., `CosineAnnealing`) to dynamically adjust the learning rate.

# Keyword Arguments
- `epochs::Int=5000`: Number of training epochs. Default is set low for fast demonstration.

# Returns
- `ps`: Trained model parameters.
- `st`: Updated model states.
"""
function train_deeponet!(
    train_state,
    data,
    lr_scheduler
    ;
    epochs=5000,
    log_cb=(x)->nothing
)
    println("--- Starting Training on Reactant Device ---")
    println("(The first epoch will trigger XLA/Enzyme compilation and may take a few minutes)")
    log_cb(Dict("type" => "status", "stage" => "XLA/Enzyme JIT Compilation running (may take a few minutes)..."))

    t_start = time()
    t_start_fast = time()
    Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
        for epoch in 1:epochs
            # Yield allows Julia to catch InterruptException thrown by the WebSocket
            yield()

            _, loss, _, train_state = Training.single_train_step!(
                AutoEnzyme(), MSELoss(), data, train_state; return_gradients=Val(false)
            )

            current_loss = Float32(loss)

            # LR scheduling
            step_scheduler!(lr_scheduler, train_state.optimizer_state, epoch, current_loss)

            if epoch == 1
                t_compiled = time()
                comp_mins = round((t_compiled - t_start) / 60, digits=2)
                t_start_fast = time() # Reset timer to avoid skewing ETA with compilation time

                msg = "Compilation finished in $comp_mins min. Fast training started."
                println(msg)
                log_cb(Dict("type" => "status", "stage" => msg))
                println("Epoch: $epoch \t Loss: $(Float32(loss))")

            elseif epoch % 500 == 0
                elapsed_fast = time() - t_start_fast
                time_per_epoch = elapsed_fast / (epoch - 1)
                epochs_left = epochs - epoch
                eta_seconds = time_per_epoch * epochs_left

                eta_str = format_eta(eta_seconds)
                println("Epoch: $epoch \t Loss: $(Float32(loss)) \t ETA: $eta_str")
                log_cb(Dict(
                    "type" => "progress",
                    "stage" => "Training DeepONet",
                    "epoch" => epoch,
                    "total_epochs" => epochs,
                    "loss" => current_loss,
                    "eta" => round(eta_seconds, digits=1)
                ))
            end
        end
    end

    total_mins = round((time() - t_start) / 60, digits=2)
    println("--- Training Completed in $total_mins minutes ---")

    return train_state.parameters, train_state.states
end

"""
    train_fno!(train_state, dataloader; epochs=10000)

Executes the training loop for the FNO model.
Unlike DeepONet, FNO utilizes a `DataLoader` for mini-batching across the
parameter space `N_sigma` natively supported by Lux/Reactant.
"""
function train_fno!(
    train_state,
    dataloader,
    lr_scheduler
    ;
    epochs=10000,
    log_cb=(x)->nothing
)
    println("--- Starting FNO Training on Reactant Device ---")
    println("(The first epoch will trigger XLA/Enzyme compilation and may take a few minutes)")
    log_cb(Dict("type" => "status", "stage" => "XLA/Enzyme JIT Compilation running (may take a few minutes)..."))

    t_start = time()
    t_start_fast = time()

    Reactant.with_config(; dot_general_precision=PrecisionConfig.HIGH) do
        for epoch in 1:epochs

            # Yield allows Julia to catch InterruptException thrown by the WebSocket
            yield()

            local current_loss = 0.0f0

            # Iterate over the batches in the dataloader
            for batch in dataloader

                # Move the mini-batch to the XLA device
                batch_dev = batch |> XDEV

                _, loss_val, _, train_state = Training.single_train_step!(
                    AutoEnzyme(), MSELoss(), batch_dev, train_state; return_gradients=Val(false)
                )
                current_loss = Float32(loss_val)
            end

            # LR scheduling
            step_scheduler!(lr_scheduler, train_state.optimizer_state, epoch, current_loss)

            if epoch == 1
                t_compiled = time()
                comp_mins = round((t_compiled - t_start) / 60, digits=2)
                t_start_fast = time() # Reset timer to avoid skewing ETA with compilation time

                msg = "Compilation finished in $comp_mins min. Fast training started."
                println(msg)
                log_cb(Dict("type" => "status", "stage" => msg))
                println("Epoch: $epoch \t Loss: $(Float32(current_loss))")
            elseif epoch % 500 == 0
                elapsed_fast = time() - t_start_fast
                time_per_epoch = elapsed_fast / (epoch - 1)
                epochs_left = epochs - epoch
                eta_seconds = time_per_epoch * epochs_left

                eta_str = format_eta(eta_seconds)
                println("Epoch: $epoch \t Loss: $current_loss\t ETA: $eta_str")

                log_cb(Dict(
                    "type" => "progress",
                    "stage" => "Training FNO",
                    "epoch" => epoch,
                    "total_epochs" => epochs,
                    "loss" => current_loss,
                    "eta" => round(eta_seconds, digits=1)
                ))
            end
        end
    end

    t_end = time()
    total_mins = round((t_end - t_start) / 60, digits=2)
    println("--- FNO Training Completed in $total_mins minutes ---")

    return train_state.parameters, train_state.states
end


# --------------- SPECIALIZED DISPATCH ------------------

"""
    prepare_and_train(solver::DeepONetSolver, fem_data::Dict, lr_scheduler)

Specialized dispatch for formatting High-Fidelity Data into DeepONet's Branch/Trunk
structure, initializing the architecture on the appropriate hardware device, and
executing the training loop.

# Arguments
- `solver`: The `DeepONetSolver` struct containing hyperparameters.
- `fem_data::Dict`: The loaded High-Fidelity dataset containing snapshots and grids.
- `lr_scheduler`: The initialized learning rate scheduler to be passed to the training loop.

# kwargs
- `log_cb`: callback function to send log to the frontend

# Returns
- Tuple containing: `(ps_cpu, st_cpu, max_u)` safely moved back to RAM.
"""
function prepare_and_train(
    solver::DeepONetSolver,
    fem_data::Dict,
    lr_scheduler
    ;
    log_cb=(x)->nothing
)
    # Extract structural configs
    n_epochs = solver.epochs
    step_x = solver.step_x
    step_t = solver.step_t
    m_sensors = solver.m_sensors
    p_latent = solver.p_latent
    hidden = solver.hidden

    # Extract FEM Data
    snapshots = fem_data["snapshots"]       # Shape: (N_dofs, N_sigma, N_time)
    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    σ_values = fem_data["sigma_values"]
    fem_config = fem_data["config"]         # Extract config to get physical domain L

    N_x_full, N_sigma, N_t_full = size(snapshots)
    println("Loaded FEM Snapshots: $N_x_full spatial DoFs, $N_t_full time steps, $N_sigma parameters.")

    # Data Formatting for DeepONet
    idx_x = 1:step_x:N_x_full
    idx_t = 1:step_t:N_t_full

    x_red = x_grid[idx_x]
    t_red = t_grid[idx_t]
    N_x_red = length(x_red)
    N_t_red = length(t_red)
    N_points = N_x_red * N_t_red

    println("Reduced grid for fast training: $N_points points per parameter.")

    # Model Definition (DeepONet)
    deepONet, x_sensors = DeepONetArch.build_deeponet(
        m_sensors=m_sensors,
        p_latent=p_latent,
        hidden=hidden,
        L=fem_config["L"]
    )

    # Branch Net Input (Sensors): f_train
    # We sample the initial condition u0 at fixed sensor locations
    f_train = zeros(Float32, m_sensors, N_sigma)

    pi_f32 = Float32(π)
    for (i, σ_val) in enumerate(σ_values)
        σ = σ_val[1]
        u₀(x) = (1 / √(2 * pi_f32 * σ)) * exp(-x^2 / (2 * σ))
        f_train[:, i] .= Float32.(u₀.(x_sensors))
    end

    # Trunk Net Input (Spatio-temporal coordinates): x_train
    # Create a flattened meshgrid of (x, t)
    x_flat = repeat(x_red, outer=N_t_red)
    t_flat = repeat(t_red, inner=N_x_red)
    x_train = Float32.(vcat(x_flat', t_flat')) # Shape: (2, N_points)

    # Target Output: u_train
    u_train = zeros(Float32, N_points, N_sigma)
    snapshots_red = @views snapshots[idx_x, :, idx_t]

    for i in 1:N_sigma
        u_train[:, i] .= Float32.(vec(snapshots_red[:, i, :]))
    end

    # Normalize targets for stable training
    max_u = maximum(abs.(u_train))
    u_train ./= max_u

    println("\n=== DeepONet Tensor Shapes ===")
    println("Original Grid         : $(N_x_full) space * $(N_t_full) time")
    println("Reduced Grid        : $(N_x_red) space * $(N_t_red) time = $(N_points) points")
    println("Branch Input (f_train): $(size(f_train)) \t -->\t (m_sensors, N_sigma)")
    println("Trunk Input  (x_train): $(size(x_train)) \t -->\t (2_coordinates, N_points)")
    println("Target Output (u_train): $(size(u_train)) \t-->\t (N_points, N_sigma)")
    println("==============================\n")

    # Move data to XLA device using global variables
    f_data = f_train |> XDEV
    x_data = x_train |> XDEV
    u_data = u_train |> XDEV
    train_data = ((f_data, x_data), u_data)

    # Setup Architecture State
    rng = Random.default_rng()
    Random.seed!(rng, 42)
    ps, st = Lux.setup(rng, deepONet) |> XDEV

    # Training Loop Initialization
    println("\n--- Initializing Optimizer and TrainState ---")
    opt = Adam(0.001f0)
    train_state = Training.TrainState(deepONet, ps, st, opt)

    # @time shows how long the compilation + execution took
    @time ps_trained, st_trained = train_deeponet!(
        train_state, train_data, lr_scheduler;
        epochs=n_epochs, log_cb=log_cb
    )

    # Move parameters back to CPU before returning for reliable serialization
    ps_cpu = ps_trained |> CDEV
    st_cpu = st_trained |> CDEV

    return ps_cpu, st_cpu, Float32(max_u)
end

"""
    prepare_and_train(solver::FNOSolver, fem_data::Dict, lr_scheduler)

Specialized dispatch for formatting High-Fidelity Data into FNO's multi-channel
tensor structure `(N_x, in/out_channels, batch)`.
Initializes a `DataLoader` for batch processing on the Reactant device.

# Arguments
- `solver`: The `FNOSolver` struct containing hyperparameters.
- `fem_data::Dict`: The loaded High-Fidelity dataset containing snapshots and grids.
- `lr_scheduler`: The initialized learning rate scheduler to be passed to the training loop.

# kwargs
- `log_cb`: callback function to send log to the frontend

"""
function prepare_and_train(
    solver::FNOSolver,
    fem_data::Dict,
    lr_scheduler
    ;
    log_cb=(x)->nothing
)
    n_epochs = solver.epochs
    nx_red = solver.nx_red
    nt_red = solver.nt_red
    hidden_channels = solver.hidden_channels
    modes = solver.modes

    snapshots = fem_data["snapshots"]
    x_grid = fem_data["x_grid"]
    t_grid = fem_data["t_grid"]
    σ_values = fem_data["sigma_values"]

    N_x_full, N_sigma, N_t_full = size(snapshots)
    println("Loaded FEM Snapshots: $N_x_full spatial DoFs, $N_t_full time steps, $N_sigma parameters.")

    # Data Reduction
    idx_x = round.(Int, range(1, N_x_full, length=nx_red))
    idx_t = round.(Int, range(1, N_t_full, length=nt_red))
    x_red = x_grid[idx_x]
    t_red = t_grid[idx_t]
    N_x_red = length(x_red)
    N_t_red = length(t_red)

    println("Reduced FNO grid: $N_x_red spatial nodes (optimal for FFT if 2^n), predicting $N_t_red time steps.")

    # Tensor initialization shape: (grid_size, in/out_channels, batch_size)
    u_in = zeros(Float32, N_x_red, 1, N_sigma)
    u_out = zeros(Float32, N_x_red, N_t_red, N_sigma)

    pi_f32 = Float32(π)
    for i in 1:N_sigma
        σ_val = σ_values[i][1]
        u₀(x) = (1.0f0 / √(2.0f0 * pi_f32 * σ_val)) * exp(-x^2 / (2.0f0 * σ_val))

        u_in[:, 1, i] .= Float32.(u₀.(x_red))
        u_out[:, :, i] .= Float32.(snapshots[idx_x, i, idx_t])
    end

    max_u = maximum(abs.(u_out))
    u_in ./= max_u
    u_out ./= max_u

    println("\n=== FNO Tensor Shapes ===")
    println("Input (u_in):   $(size(u_in)) \t --> (N_x_red, 1_channel, N_sigma)")
    println("Target (u_out): $(size(u_out)) \t --> (N_x_red, N_t_red, N_sigma)")
    println("=========================\n")

    # Architecture Initialization
    fno = FNOArch.build_fno(
        in_channels=1,
        out_channels=N_t_red,
        hidden_channels=hidden_channels,
        modes=modes
    )

    # DataLoader setup on Device
    # Full batch (batchsize=N_sigma) is used as per the notebook
    dataloader = DataLoader((u_in, u_out); batchsize=N_sigma, shuffle=true)

    rng = Random.default_rng()
    Random.seed!(rng, 42)
    ps, st = Lux.setup(rng, fno) |> XDEV

    println("\n--- Initializing Optimizer and TrainState ---")
    opt = Adam(0.001f0)
    train_state = Training.TrainState(fno, ps, st, opt)

    @time ps_trained, st_trained = train_fno!(
        train_state, dataloader, lr_scheduler;
        epochs=n_epochs, log_cb=log_cb
    )

    ps_cpu = ps_trained |> CDEV
    st_cpu = st_trained |> CDEV

    return ps_cpu, st_cpu, Float32(max_u)
end

end # module
