module DataGeneration

using Gridap
using GridapROMs
using GridapROMs.ParamDataStructures

using ..Solvers

export generate_fem_snapshots

"""
    generate_fem_snapshots(σ_values; kwargs...)

Generates High-Fidelity (FEM) snapshots using GridapROMs.jl.

# Arguments
- `σ_values::Vector{Vector{Float64}}`: List of standard deviations for the Gaussian pulse.

# Keyword Arguments
- `order::Int=3`: The polynomial degree (order) of the finite element space used for spatial discretization.
- `L::Float64=5.0`: Domain half-length `[-L, L]`.
- `nx::Int=1000`: Number of spatial partitions (elements).
- `t0::Float64=0.0`: Initial simulation time.
- `dt::Float64=0.01`: Time step size.
- `tf::Float64=1.0`: Final simulation time.
- `c::Float64=1.0`: Advection velocity.
- `θ::Float64=0.5`: Theta-method parameter (0.5 for Crank-Nicolson).

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

    # Spatial domain setup
    Ω = (-L, L)
    partition = (nx,)
    model = CartesianDiscreteModel(Ω, partition)

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

    # Finite Element Spaces
    reffe = ReferenceFE(lagrangian, Float64, order)
    # This would be the correct way to define the FE space, but the solve crashes in GridapROMs...
    # V = OrderedFESpace(model, reffe; vector_type=Vector{Float32})
    V = OrderedFESpace(model, reffe)
    U = TransientTrialParamFESpace(V, uₚₜ)

    degree = 2 * order
    τₕ = Triangulation(model)
    dΩ = Measure(τₕ, degree)

    # Weak form definition
    m(σ, t, du, v) = ∫(v * du)dΩ
    a(σ, t, u, v) = ∫(v * (c_vec ⋅ ∇(u)))dΩ
    r(σ, t, u, v) = m(σ, t, ∂t(u), v) + a(σ, t, u, v)

    feop = TransientLinearParamOperator(r, (a, m), D, U, V)

    # Solving Phase (High-Fidelity)
    uh₀ₚ(σ) = interpolate_everywhere(u₀ₚ(σ), U(σ, t0))
    slvr = ThetaMethod(LUSolver(), dt, θ)

    σₒₙ = TransientRealisation(Realisation(σ_values), tdomain)

    # Extract the snapshot matrix using GridapROMs API
    x_snapshots_raw, _ = solution_snapshots(slvr, feop, σₒₙ, uh₀ₚ)

    # Convert the GridapROMs custom type into a standard Julia 3D Array
    # This prevents JLD2 type-reconstruction errors during loading
    x_snapshots = get_all_data(x_snapshots_raw)

    #TODO This is a little hacky, it works as the test case is 1D. For now, it works.
    # In future, you should consider the following:
    # x_grid = get_node_coordinates(τₕ) # typeof(x_grid) == Vector{VectorValue{D,Float64}} for D-dimensional problems

    # Extracting the spatial grid for downstream neural operators
    coord_x(x_val) = x_val[1]
    x_fe_function = interpolate_everywhere(coord_x, V)

    # Cast matrices and vectors to Float32 for the training
    x_snapshots = Float32.(x_snapshots_raw)
    x_grid = Float32.(get_free_dof_values(x_fe_function))
    t_grid = Float32.(tdomain[2:end])

    return (
        snapshots=x_snapshots,
        x_grid=x_grid,
        t_grid=t_grid
    )
end

end # module
