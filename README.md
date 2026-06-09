# Neural Operators Experiments

This subfolder contains the Julia scripts to test the interaction between `NeuralOperators.jl` and `GridapROMs.jl` for High-Fidelity FEM data generation, model training, and zero-shot evaluation. The workflow is managed using `DrWatson.jl` for strict reproducibility and SHA-256 caching.

## Initial Setup

Before running the scripts for the first time, instantiate the environment:

```julia
julia> ]
(@v1.x) pkg> activate .
(experiments_NeuralOperators) pkg> instantiate
(experiments_NeuralOperators) pkg> add NNlib
```

## Usage

#### From the REPL (Recommended)
This approach allows access to all keyword arguments.

```julia
using experiments_NeuralOperators.ModelTypes
include("scripts/run_all_models.jl")

# Example for FNO
run_pipeline(FNO(); nx_red=256, nt_red=50, epochs=10000)
```

#### From the Terminal
For quick execution:

```Bash
# Usage: julia scripts/run_all_models.jl [model_type] [epochs] [sigma_test]
julia scripts/run_all_models.jl fno 10000 0.03
```

## Parameters
The `run_pipeline(model; kwargs...)` function accepts several optional keyword arguments.

| Category | Parameter | Default | Description |
| :--- | :--- | :--- | :--- |
| **Data Generation** | `beta_start` | `1.0` | Starting exponent for $\sigma = 10^{-\beta}$. |
| | `beta_end` | `2.0` | Final exponent for $\sigma = 10^{-\beta}$. |
| | `beta_step` | `0.2` | Step size for the parameter space. |
| | `order` | `3` | Polynomial degree of the finite element space. |
| | `L` | `5.0` | Domain half-length $[-L, L]$. |
| | `nx` | `1000` | Number of spatial partitions for FEM. |
| | `t0`, `dt`, `tf` | `0.0`, `0.01`, `1.0` | Initial, step, and final simulation time. |
| | `c`, `theta` | `1.0`, `0.5` | Advection velocity and Theta-method parameter. |
| **Training (Global)** | `epochs` | `20000` | Total number of training epochs. |
| **DeepONet** | `step_x`, `step_t` | `10`, `5` | Spatial and temporal subsampling factors. |
| | `m_sensors` | `100` | Number of input sensors for the Branch Net. |
| | `p_latent`, `hidden` | `64`, `64` | Latent space dimension and neurons per hidden layer. |
| **FNO** | `nx_red` | `256` | Spatial nodes extracted for FFT. Note: Use powers of 2 (64, 128, 256, 512) for optimal XLA/FFT performance. |
| | `nt_red` | `50` | Number of temporal steps to predict (output channels). |
| | `hidden_channels` | `(64, 64, 128)` | Tuple defining channel widths of hidden Fourier layers. |
| | `modes` | `(32,)` | Tuple of Fourier modes to retain. |
| **Evaluation** | `sigma_test` | `0.03` | Unseen physical parameter for Zero-Shot evaluation. |

_Note: Data and Model hashes are automatically managed and cached in `data/registry.json`. Computations are skipped if the configuration hash already exists._