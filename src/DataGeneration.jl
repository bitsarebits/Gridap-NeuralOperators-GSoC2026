module DataGeneration

using Gridap
using GridapROMs
using GridapROMs.ParamDataStructures
using GridapROMs.TProduct

using ..Solvers

export generate_fem_snapshots

"""
    generate_fem_snapshots(σ_values::Vector{Vector{Float64}}, config::FEMConfig)

Generates High-Fidelity (FEM) snapshots using GridapROMs.jl.

# Arguments
- `σ_values::Vector{Vector{Float64}}`: List of standard deviations for the Gaussian pulse.
- `config::FEMConfig`: A struct containing all physical and numerical parameters for the FEM simulation.

# Returns
- A `NamedTuple` containing:
    - `snapshots`: High-fidelity solution tensor of shape `(N_dofs, N_sigma, N_time)`.
    - `x_grid`: Spatial coordinates of the free Degrees of Freedom (DoFs).
    - `t_grid`: Temporal coordinates corresponding to the snapshots.
"""
function generate_fem_snapshots(
    σ_values::Vector{Vector{Float64}},
    config::FEMConfig
)
    # Extract the parameters from the struct
    order = config.order
    L = config.L
    nx = config.nx
    t0 = config.t0
    dt = config.dt
    tf = config.tf
    c = config.c
    θ = config.theta

    # Spatial domain setup (TProductDiscreteModel provides lexicographically ordered DoFs)
    Ω = (-L, L)
    partition = (nx,)
    model = TProductDiscreteModel(Ω, partition)

    # Temporal grid setup
    tdomain = t0:dt:tf

    # Parametric Space and Analytical Functions
    pdomain = (σ_values[end][1], σ_values[1][1])
    D = TransientParamSpace(pdomain, tdomain)

    c_vec = VectorValue(c)
    u₀(σ) = x -> (1 / √(2 * π * σ[1])) * exp(-x[1]^2 / (2 * σ[1]))
    u(σ, t) = x -> (1 / √(2 * π * σ[1])) * exp(-(x[1] - c * t)^2 / (2 * σ[1]))

    u₀ₚ(σ) = parameterise(u₀, σ)
    uₚₜ(σ, t) = parameterise(u, σ, t)

    # Finite Element Spaces (ordered along the 1D spatial coordinate)
    reffe = ReferenceFE(lagrangian, Float64, order)
    τₕ = Triangulation(model)
    V = TProductFESpace(τₕ, reffe; conformity=:H1)
    U = TransientTrialParamFESpace(V, uₚₜ)

    degree = 2 * order
    dΩ = Measure(τₕ, degree)

    # Weak form definition (homogeneous transport: rhs = 0)
    m(σ, t, du, v) = ∫(v * du)dΩ
    a(σ, t, u, v) = ∫(v * (c_vec ⋅ ∇(u)))dΩ
    rhs(σ, t, v) = ∫(0.0 * v)dΩ

    feop = TransientLinearParamOperator(rhs, (a, m), D, U, V)

    # Solving Phase (High-Fidelity)
    uh₀ₚ(σ) = interpolate_everywhere(u₀ₚ(σ), U(σ, t0))
    slvr = ThetaMethod(LUSolver(), dt, θ)

    σₒₙ = TransientRealisation(Realisation(σ_values), tdomain)

    # Extract the snapshot matrix using GridapROMs v0.2+ API
    x_snapshots_raw = solution_snapshots(slvr, feop, σₒₙ, uh₀ₚ)

    # Convert the GridapROMs custom type into a standard Julia 3D Array (N_dofs, N_sigma, N_time)
    # This prevents JLD2 type-reconstruction errors during loading
    t_grid = Float32.(tdomain[2:end])
    raw_data = get_all_data(x_snapshots_raw)
    x_snapshots = Float32.(reshape(raw_data, num_free_dofs(V), length(σ_values), length(t_grid)))

    # Extracting the spatial grid for downstream neural operators
    coord_x(x_val) = x_val[1]
    x_fe_function = interpolate_everywhere(coord_x, V)

    # Cast spatial coordinates to Float32 for the training
    x_grid = Float32.(get_free_dof_values(x_fe_function))

    return (
        snapshots=x_snapshots,
        x_grid=x_grid,
        t_grid=t_grid
    )
end

end # module
