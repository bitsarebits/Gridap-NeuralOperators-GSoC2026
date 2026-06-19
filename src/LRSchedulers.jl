using Optimisers

export AbstractLRScheduler, ReduceLROnPlateau, CosineAnnealing
export step_scheduler!, get_scheduler_info, init_scheduler

# Super-type
abstract type AbstractLRScheduler end

"""
    CosineAnnealing

A learning rate scheduler that implements the Cosine Annealing decay schedule.
It decreases the learning rate from a maximum value
to a minimum value following the shape of a half-cosine wave.

# Fields / Keyword Arguments
- `lr_max::Float32`: The initial, maximum learning rate (default: `0.001f0`).
- `lr_min::Float32`: The final, minimum learning rate (default: `1e-6f0`).
- `max_epochs::Int`: The total number of epochs over which the decay occurs (default: `20000`).
"""
mutable struct CosineAnnealing <: AbstractLRScheduler
    lr_max::Float32
    lr_min::Float32
    max_epochs::Int
end

# Constructor providing default values
CosineAnnealing(; lr_max=0.001f0, lr_min=1f-6, max_epochs=20000) =
    CosineAnnealing(lr_max, lr_min, max_epochs)


"""
    step_scheduler!(scheduler::CosineAnnealing, opt_state, epoch::Int, loss)

Calculates the new learning rate for the current `epoch` using the Cosine Annealing
formula and updates the optimizer state in-place via `Optimisers.adjust!`.

# Arguments
- `scheduler::CosineAnnealing`: The initialized scheduler instance.
- `opt_state`: The current state of the Optimisers.jl optimizer.
- `epoch::Int`: The current training epoch.
- `loss`: The current training loss (ignored in this time-based scheduler, but
  required to maintain a unified interface via Multiple Dispatch).
"""
function step_scheduler!(scheduler::CosineAnnealing, opt_state, epoch, loss)
    # Cap the epoch at max_epochs to prevent the learning rate from rising again
    # if the training loop runs longer than the intended schedule
    t = min(epoch, scheduler.max_epochs)

    # Calculate the cosine fraction: cos(π * t / T_max)
    cos_val = cos(Float32(π) * (Float32(t) / Float32(scheduler.max_epochs)))

    # Standard Cosine Annealing formula: η_min + 0.5 * (η_max - η_min) * (1 + cos(θ))
    new_lr = scheduler.lr_min + 0.5f0 * (scheduler.lr_max - scheduler.lr_min) * (1.0f0 + cos_val)

    # Update the optimizer's learning rate in-place
    Optimisers.adjust!(opt_state, new_lr)
end

"""
    get_scheduler_info(s::CosineAnnealing)

Returns a deterministic string representation of the scheduler's hyperparameters.
This guarantees collision-free SHA-256 hashes.
"""
get_scheduler_info(s::CosineAnnealing) = "CosineAnnealing_max=$(s.lr_max)_min=$(s.lr_min)_ep=$(s.max_epochs)"


"""
    ReduceLROnPlateau

Dynamic learning rate scheduler. Reduces the learning rate by a `factor`
when the loss has stopped improving for a given `patience` (number of epochs).
"""
mutable struct ReduceLROnPlateau <: AbstractLRScheduler
    patience::Int
    factor::Float32
    min_lr::Float32
    wait::Int
    best_loss::Float32
    current_lr::Float32
end

# Constructor with default values
ReduceLROnPlateau(;
    patience=100,
    factor=0.5f0,
    min_lr=1f-6,
    start_lr=0.001f0
) = ReduceLROnPlateau(patience, factor, min_lr, 0, Inf32, start_lr)


"""
    step_scheduler!(scheduler::ReduceLROnPlateau, opt_state, current_epoch, current_loss)

Dispatches the plateau logic. Updates `opt_state`.
"""
function step_scheduler!(scheduler::ReduceLROnPlateau, opt_state, current_epoch, current_loss)
    # Check if the loss improved
    if current_loss < scheduler.best_loss
        scheduler.best_loss = current_loss
        scheduler.wait = 0
    else
        scheduler.wait += 1
    end

    # Learning rate decay if patience is exceeded
    if scheduler.wait >= scheduler.patience
        new_lr = max(scheduler.current_lr * scheduler.factor, scheduler.min_lr)
        if new_lr < scheduler.current_lr
            println(">>> Plateau: LR decreased from $(scheduler.current_lr) to $new_lr <<<")
            scheduler.current_lr = new_lr
            Optimisers.adjust!(opt_state, new_lr)
        end

        # Reset the wait counter after a decay
        scheduler.wait = 0
    end
end

get_scheduler_info(s::ReduceLROnPlateau) = "ReduceLROnPlateau_pat=$(s.patience)_fac=$(s.factor)_min=$(s.min_lr)"


# INITIALIZATION
# Pure type (ex. `CosineAnnealing`). Instantiate
init_scheduler(T::Type{CosineAnnealing}, epochs::Int) = T(max_epochs=epochs)
init_scheduler(T::Type{ReduceLROnPlateau}, epochs::Int) = T()

# Already instantitated object (ex. `ReduceLROnPlateau(patience=50)`)
init_scheduler(s::AbstractLRScheduler, epochs::Int) = s
