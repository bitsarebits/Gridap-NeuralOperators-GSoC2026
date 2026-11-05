module RegistryArtifacts

using JSON3
using CodecZlib

export validate_hash,
       validate_solver_dir,
       safe_joinpath,
       solver_dir_candidates,
       find_existing_solver_artifact,
       with_local_presence,
       is_valid_evaluation_json,
       decode_evaluation_json_bytes,
       read_evaluation_json,
       ensure_artifact!

const VALID_HASH_REGEX = r"\A[a-f0-9]{12}\z"
const ALLOWED_SOLVER_DIRS = Set((
    "deeponet", "fno", "nomad",
    "deeponetsolver", "fnosolver", "nomadsolver",
))

"""Validate and canonicalize a 12-character hexadecimal artifact hash."""
function validate_hash(value)::String
    value isa AbstractString || throw(ArgumentError("Invalid hash: expected a string."))
    hash = lowercase(strip(String(value)))
    occursin(VALID_HASH_REGEX, hash) ||
        throw(ArgumentError("Invalid hash format: expected 12 hexadecimal characters."))
    return hash
end

"""Validate and normalize a solver name to its safe on-disk directory name."""
function validate_solver_dir(value)::String
    value isa AbstractString || throw(ArgumentError("Invalid solver_type: expected a string."))
    solver_dir = lowercase(strip(String(value)))
    solver_dir in ALLOWED_SOLVER_DIRS ||
        throw(ArgumentError("Invalid solver_type: $(repr(solver_dir))."))
    return solver_dir
end

"""Return canonical and legacy directory spellings for a known solver."""
function solver_dir_candidates(value)::Vector{String}
    canonical = validate_solver_dir(value)
    alternate = endswith(canonical, "solver") ?
        chop(canonical; tail=6) : canonical * "solver"
    candidates = String[canonical]
    alternate == canonical || push!(candidates, alternate)
    return candidates
end

"""Find an existing solver artifact across current and legacy folder names."""
function find_existing_solver_artifact(
    base_dir::AbstractString,
    solver_type,
    filename::AbstractString,
)
    for solver_dir in solver_dir_candidates(solver_type)
        path = safe_joinpath(base_dir, solver_dir, filename)
        isfile(path) && return path
    end
    return nothing
end

"""
    safe_joinpath(base_dir, parts...)

Join path components while ensuring the normalized result stays inside `base_dir`.
The separator is converted to a String explicitly (rather than concatenating a Char).
"""
function safe_joinpath(base_dir::AbstractString, parts::AbstractString...)::String
    root = normpath(abspath(base_dir))
    candidate = normpath(abspath(joinpath(root, parts...)))
    separator = string(Base.Filesystem.path_separator)
    root_prefix = endswith(root, separator) ? root : root * separator

    (candidate == root || startswith(candidate, root_prefix)) ||
        throw(ArgumentError("Path traversal attempt blocked."))
    return candidate
end

@inline function _nonempty_file(path::AbstractString)::Bool
    return isfile(path) && filesize(path) > 0
end


"""Decode a gzipped or plain evaluation response and validate that it is JSON."""
function decode_evaluation_json_bytes(bytes::AbstractVector{UInt8})::Vector{UInt8}
    decoded = if length(bytes) >= 2 && bytes[1] == 0x1f && bytes[2] == 0x8b
        transcode(GzipDecompressor, bytes)
    else
        Vector{UInt8}(bytes)
    end
    JSON3.read(String(copy(decoded)), Dict{String,Any})
    return decoded
end

"""Return true only when a non-empty evaluation artifact contains valid JSON."""
function is_valid_evaluation_json(path::AbstractString)::Bool
    _nonempty_file(path) || return false
    try
        JSON3.read(read(path, String), Dict{String,Any})
        return true
    catch
        return false
    end
end

function _solver_type_for_evaluation(registry::AbstractDict, eval_hash::String)
    evaluations = get(registry, "evaluations", nothing)
    evaluations isa AbstractDict || return nothing
    evaluation = get(evaluations, eval_hash, nothing)
    evaluation isa AbstractDict || return nothing

    model_hash = get(evaluation, "model_hash", nothing)
    model_hash isa AbstractString || return nothing
    models = get(registry, "models", nothing)
    models isa AbstractDict || return nothing
    model = get(models, String(model_hash), nothing)
    model isa AbstractDict || return nothing

    return get(model, "solver_type", nothing)
end

"""Return a copy of a registry annotated with physical artifact presence."""
function with_local_presence(
    registry::AbstractDict;
    data_dir::AbstractString,
    models_dir::AbstractString,
    plots_dir::AbstractString,
)
    result = deepcopy(registry)

    data_entries = get(result, "data", Dict{String,Any}())
    if data_entries isa AbstractDict
        for (raw_hash, entry) in data_entries
            entry isa AbstractDict || continue
            is_present = false
            try
                hash = validate_hash(raw_hash)
                path = safe_joinpath(data_dir, "data_$(hash).jld2")
                is_present = _nonempty_file(path)
            catch
                # Invalid registry metadata must never be treated as a local file.
            end
            entry["_isLocal"] = is_present
        end
    end

    model_entries = get(result, "models", Dict{String,Any}())
    if model_entries isa AbstractDict
        for (raw_hash, entry) in model_entries
            entry isa AbstractDict || continue
            is_present = false
            try
                hash = validate_hash(raw_hash)
                raw_solver = get(entry, "solver_type", nothing)
                if raw_solver isa AbstractString
                    for solver_dir in solver_dir_candidates(raw_solver)
                        path = safe_joinpath(models_dir, solver_dir, "model_$(hash).jld2")
                        if _nonempty_file(path)
                            is_present = true
                            break
                        end
                    end
                end
            catch
                # Invalid registry metadata must never be treated as a local file.
            end
            entry["_isLocal"] = is_present
        end
    end

    evaluation_entries = get(result, "evaluations", Dict{String,Any}())
    if evaluation_entries isa AbstractDict
        for (raw_hash, entry) in evaluation_entries
            entry isa AbstractDict || continue
            is_present = false
            try
                hash = validate_hash(raw_hash)
                raw_solver = _solver_type_for_evaluation(result, hash)
                if raw_solver isa AbstractString
                    for solver_dir in solver_dir_candidates(raw_solver)
                        path = safe_joinpath(plots_dir, solver_dir, "eval_$(hash).json")
                        if is_valid_evaluation_json(path)
                            is_present = true
                            break
                        end
                    end
                end
            catch
                # Invalid or incomplete dependency metadata is not local presence.
            end
            entry["_isLocal"] = is_present
        end
    end

    return result
end

"""
    read_evaluation_json(eval_hash, registry, plots_root; solver_hint=nothing)

Resolve an evaluation's solver directory from the local registry first, then try the
validated frontend hint. Both current `*Solver` and legacy short directory names are
supported. Returns a NamedTuple with `status=:ok`, `:not_found`, or `:invalid_json`.
"""
function read_evaluation_json(
    raw_hash,
    registry::AbstractDict,
    plots_root::AbstractString;
    solver_hint=nothing,
)
    hash = validate_hash(raw_hash)
    solver_values = Any[]

    registered_solver = _solver_type_for_evaluation(registry, hash)
    registered_solver === nothing || push!(solver_values, registered_solver)
    solver_hint === nothing || push!(solver_values, solver_hint)

    directories = String[]
    for raw_solver in solver_values
        try
            for directory in solver_dir_candidates(raw_solver)
                directory in directories || push!(directories, directory)
            end
        catch
            # Ignore an invalid optional hint; registry metadata remains authoritative.
        end
    end

    isempty(directories) && return (
        status = :not_found,
        data = nothing,
        path = nothing,
        searched_paths = String[],
        message = "Evaluation solver metadata is missing or invalid.",
    )

    searched_paths = String[]
    for directory in directories
        path = safe_joinpath(plots_root, directory, "eval_$(hash).json")
        push!(searched_paths, path)
        isfile(path) || continue
        if !_nonempty_file(path)
            return (
                status = :invalid_json,
                data = nothing,
                path = path,
                searched_paths = searched_paths,
                message = "Evaluation artifact is empty.",
            )
        end

        parsed = try
            JSON3.read(read(path, String), Dict{String,Any})
        catch error
            return (
                status = :invalid_json,
                data = nothing,
                path = path,
                searched_paths = searched_paths,
                message = "Evaluation artifact contains invalid JSON: $(sprint(showerror, error))",
            )
        end

        return (
            status = :ok,
            data = parsed,
            path = path,
            searched_paths = searched_paths,
            message = "Evaluation JSON loaded successfully.",
        )
    end

    return (
        status = :not_found,
        data = nothing,
        path = nothing,
        searched_paths = searched_paths,
        message = "Evaluation JSON not found in any recognized solver directory.",
    )
end

"""
    ensure_artifact!(destination, downloader)

Ensure a downloader actually creates a non-empty artifact before the caller commits
registry metadata. Returns `true` when a download was needed and `false` on cache hit.
"""
function ensure_artifact!(
    destination::AbstractString,
    downloader::Function;
    validator::Function=_nonempty_file,
)::Bool
    validator(destination) && return false

    if isfile(destination)
        rm(destination; force=true)
    end
    mkpath(dirname(destination))
    downloader(destination)

    validator(destination) ||
        throw(ErrorException("Artifact download completed without producing a valid file: $destination"))
    return true
end

end # module
