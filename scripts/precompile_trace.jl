# scripts/precompile_trace.jl

using Pkg
const EXPERIMENT_ROOT = joinpath(@__DIR__, "..")
Pkg.activate(EXPERIMENT_ROOT)

using Gridap
using GridapROMs
using NeuralOperators
using Lux
using Reactant
using Enzyme
using Oxygen
using HTTP
using JSON3

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
using experiments_NeuralOperators.DataGeneration
using experiments_NeuralOperators.HashRegistry

@info "Starting Precompile Trace for PackageCompiler..."

# Redirect stdout to avoid massive JIT compilation logs polluting the terminal
redirect_stdout(devnull) do
    # WARMUP OXYGEN.JL & HTTP
    @get "/_precompile_ping" function (req)
        return json(Dict("status" => "ready"))
    end

    req = HTTP.Request("GET", "/_precompile_ping")
    Oxygen.internalrequest(req)

end # end redirect_stdout

@info "Precompile Trace finished successfully."
