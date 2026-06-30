# Neural Operators Experiments

This subfolder contains the Julia scripts designed to test the integration between `NeuralOperators.jl` and `GridapROMs.jl`. The workflow covers High-Fidelity FEM data generation, model training (with `Lux.jl` and `Enzyme.jl` for AD), and zero-shot evaluation. 

To ensure strict reproducibility and avoid redundant computations, the entire pipeline is managed using `DrWatson.jl` and a custom SHA-256 caching mechanism (`HashRegistry.jl`).

## Physical Problem: 1D Linear Transport

We consider the one-dimensional linear transport equation (Reference: *Reduced Basis Methods for Partial Differential Equations*, Quarteroni):

$$
\partial_t u(x,t) + c \partial_x u(x,t) = 0, \quad (x,t) \in \mathbb{R} \times (0,t_f)
$$
$$
u(x,0) = u_0(x), \quad x \in \mathbb{R}
$$

The exact solution is a traveling wave $u(x,t) = u_0(x - ct)$. By default, the scripts assume a wave speed of $c = 1.0$ and a final simulation time $t_f = 1.0$ (both adjustable via keyword arguments). The initial condition is defined as a Gaussian pulse:

$$
u_0(x) = \frac{1}{\sqrt{2\pi\sigma}} \exp\left(-\frac{x^2}{2\sigma}\right)
$$

The primary physical parameter of interest is the variance $\sigma$, expressed as $\sigma = 10^{-\beta}$. In our parametrical studies, $\beta$ acts as the variable used to generate varying snapshots, mapping the parameter space for both training and evaluating the reduced-order models.

## Initial Setup

Before running the scripts for the first time, you must instantiate the Julia environment to fetch all required dependencies:

```julia
julia> ]
(@v1.x) pkg> activate .
(experiments_NeuralOperators) pkg> instantiate
```

## Usage

The architecture is modular and designed for interactive experimentation directly from the Julia REPL. Hyperparameters and physical variables are encapsulated in statically typed configuration structs to ensure type stability and seamless caching.

### Interactive REPL Workflow

1. **Start a Julia REPL** in the project's root directory.

2. **Include the main pipeline script**:
   ```julia
   julia> include("scripts/run_all_models.jl")
   ```

3. **Define Configurations**:
   Initialize and customize the configuration structs. You only need to specify the parameters that deviate from the defaults.

   ```julia
   # 1. Define the physical/numerical parameters for data generation
   julia> fem_setup = FEMConfig(nx=500, dt=0.005)
   FEMConfig(1.0, 2.0, 0.2, 3, 5.0, 500, 0.0, 0.005, 1.0, 1.0, 0.5)

   # 2. Define the solver and its hyperparameters
   julia> solver = FNOSolver(epochs=5000, modes=(16, 16))
   FNOSolver(5000, 256, 50, LRSchedulers.CosineAnnealing(0.001f0, 1.0f-6, 20000), (64, 64, 128), (16, 16))

   # 3. Define the evaluation parameters
   julia> eval_setup = EvalConfig(sigma_test=0.05)
   EvalConfig(0.05)
   ```

4. **Execute the Pipeline**:
   The pipeline will automatically handle data generation, training, and plotting. Thanks to the hashing registry, any previously completed step will be instantly loaded from the cache rather than recomputed.
   ```julia
   julia> run_pipeline(solver, fem_setup, eval_setup)
   ```

### CLI Execution
For automated benchmarking or cluster deployment, the scripts can be executed directly from the terminal. This exposes a simplified interface for the core parameters:

```bash
# Usage: julia scripts/run_all_models.jl [model_type] [epochs] [test_sigma] [nx]
julia scripts/run_all_models.jl fno 10000 0.05 1000
```

## Web Dashboard & Real-Time Visualization

This project includes a React web dashboard to orchestrate experiments and visualize High-Fidelity snapshots, training progress, and zero-shot evaluations in real-time. 

**Node.js is NOT required**. The frontend has been pre-compiled into a static build, and the `Oxygen.jl` Julia backend is natively configured to serve it.

### How to Start the Dashboard via Julia

1. Open your terminal in the root of this subfolder.
2. Launch the integrated web-server script using Julia:
   ```bash
   # If running the script from the repository root
   julia experiments_NeuralOperators/scripts/server_dashboard.jl

   # If running the script from experiments_NeuralOperators/ folder
   julia scripts/server_dashboard.jl
   ```
3. Open your web browser and navigate to:
   ```text
   http://127.0.0.1:8080
   ```

### Features available via the UI:
* **Interactive Parameter Tuning:** Configure `FEMConfig`, `DeepONetSolver`, or `FNOSolver` using visual controls.
* **Live WebSocket Streaming:** Watch the loss function drop and see the predicted traveling waves update frame-by-frame during the training loop.
* **Zero-Shot Error Analysis:** Instantly plot the absolute error between Gridap's FEM high-fidelity solution and the Neural Operator's response on unseen $\sigma$ values.

---

## Parameter Definitions

All parameters are structurally defined in `src/Solvers.jl` along with their default values.

### `FEMConfig`: Data Generation Parameters

| Parameter | Default | Description |
| :--- | :--- | :--- |
| `beta_start` | `1.0` | Starting exponent for $\sigma = 10^{-\beta}$. |
| `beta_end` | `2.0` | Final exponent for $\sigma = 10^{-\beta}$. |
| `beta_step` | `0.2` | Step size for the parameter space grid. |
| `order` | `3` | Polynomial degree of the Finite Element space. |
| `L` | `5.0` | Domain half-length $[-L, L]$. |
| `nx` | `1000` | Number of spatial partitions for the FEM mesh. |
| `t0`, `dt`, `tf` | `0.0`, `0.01`, `1.0` | Initial time, time step, and final simulation time. |
| `c`, `theta` | `1.0`, `0.5` | Advection velocity and Theta-method integration parameter. |

### `DeepONetSolver`: DeepONet Hyperparameters

| Parameter | Default | Description |
| :--- | :--- | :--- |
| `epochs` | `20000` | Total number of training epochs. |
| `step_x`, `step_t` | `10`, `5` | Spatial and temporal subsampling factors. |
| `lr_scheduler` | `CosineAnnealing()` | Learning rate scheduler instance. |
| `m_sensors` | `100` | Number of input sensors for the Branch Net. |
| `p_latent`, `hidden`| `64`, `64` | Latent space dimension and neurons per hidden layer. |

### `FNOSolver`: FNO Hyperparameters

| Parameter | Default | Description |
| :--- | :--- | :--- |
| `epochs` | `20000` | Total number of training epochs. |
| `nx_red` | `256` | Spatial nodes extracted for FFT. *Note: Use powers of 2 for optimal FFT performance.* |
| `nt_red` | `50` | Number of temporal steps to predict (output channels). |
| `lr_scheduler` | `CosineAnnealing()` | Learning rate scheduler instance. |
| `hidden_channels`| `(64, 64, 128)` | Tuple defining channel widths of hidden Fourier layers. |
| `modes` | `(32,)` | Tuple of Fourier modes to retain per spatial dimension. |

### `EvalConfig`: Evaluation Parameters

| Parameter | Default | Description |
| :--- | :--- | :--- |
| `sigma_test` | `0.03` | Unseen physical parameter used strictly for Zero-Shot evaluation. |

---
*Note: Data and Model hashes are securely managed and cached in `data/registry.json`. Computations are automatically bypassed if a matching configuration hash is detected.*