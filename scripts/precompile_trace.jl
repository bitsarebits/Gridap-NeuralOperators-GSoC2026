using Pkg
const EXPERIMENT_ROOT = joinpath(@__DIR__, "..")
Pkg.activate(EXPERIMENT_ROOT)

using DrWatson
using JLD2
using Gridap
using GridapROMs
using NeuralOperators
using Lux
using Reactant
using Enzyme
using Oxygen
using HTTP
using JSON3
using CodecZlib
using Sockets
using UUIDs
using Dates

using experiments_NeuralOperators
using experiments_NeuralOperators.Solvers
using experiments_NeuralOperators.LRSchedulers
using experiments_NeuralOperators.DataGeneration
using experiments_NeuralOperators.HashRegistry
using experiments_NeuralOperators.Pipelines
using experiments_NeuralOperators.Auth
using experiments_NeuralOperators.FirebaseREST
using experiments_NeuralOperators.RegistryArtifacts

@info "Starting Precompile Trace warmup..."

# Redirect stdout to avoid massive JIT compilation logs polluting the terminal
redirect_stdout(devnull) do
    # WARMUP OXYGEN.JL & HTTP
    @get "/_precompile_ping" function (req)
        return json(Dict("status" => "ready"))
    end

    req = HTTP.Request("GET", "/_precompile_ping")
    Oxygen.internalrequest(req)

    # Clear the temporary precompile route from Oxygen's global router state
    Oxygen.resetstate()

end # end redirect_stdout

@info "Precompile Trace finished successfully."
