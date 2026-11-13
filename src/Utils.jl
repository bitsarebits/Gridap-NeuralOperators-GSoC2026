module Utils

using Reactant, Lux
using HTTP
using JLD2

export CDEV, XDEV, raw_body, load_jld2

# Global variables for the Devices
const CDEV = cpu_device()
const XDEV = reactant_device(; force=true)

raw_body(b::Vector{UInt8}) = b
raw_body(b::HTTP.BytesBody) = b.data
raw_body(::HTTP.EmptyBody) = UInt8[]
raw_body(b) = hasproperty(b, :data) ? b.data : Vector{UInt8}(codeunits(String(b)))
raw_body(msg::Union{HTTP.Request,HTTP.Response}) = raw_body(msg.body)

function load_jld2(path::AbstractString)::Dict{String,Any}
    return JLD2.jldopen(path, "r") do f
        Dict{String,Any}(k => f[k] for k in keys(f))
    end
end

end
