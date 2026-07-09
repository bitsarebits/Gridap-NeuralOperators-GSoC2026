using PackageCompiler

# List of heavy packages to bake into the sysimage
packages_to_compile = [
    "Gridap",
    "GridapROMs",
    "Lux",
    "Reactant",
    "Enzyme",
    "NeuralOperators",
    "Oxygen",
    "HTTP",
    "CairoMakie"
]

# Create the sysimages directory if it doesn't exist
out_dir = joinpath(@__DIR__, "..", "sysimages")
mkpath(out_dir)
out_file = joinpath(out_dir, "sys_gridaproms.so")

println("Building custom sysimage... This will take some time, but will save it later.")

create_sysimage(
    packages_to_compile;
    sysimage_path=out_file,
    precompile_execution_file="scripts/precompile_trace.jl"
)

println("Sysimage created successfully! Run Julia with: julia --sysimage=sysimages/sys_gridaproms.so")
