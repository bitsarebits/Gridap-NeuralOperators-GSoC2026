module HashRegistry

using SHA
using JSON
using DrWatson

export config_hash, update_registry!, check_registry, load_registry, save_registry

const REGISTRY_PATH = datadir("registry.json")

# Helper to convert a struct in a dictionary
function struct_to_dict(x)
    if isstructtype(typeof(x)) && !isprimitivetype(typeof(x)) && !(x isa String)
        return Dict{String,Any}(string(k) => struct_to_dict(getfield(x, k)) for k in propertynames(x))
    elseif x isa Tuple || x isa AbstractArray
        return [struct_to_dict(v) for v in x]
    else
        return x
    end
end

# Internal helper to save in the JSON registry
function _save_registry(registry::AbstractDict)
    open(REGISTRY_PATH, "w") do f
        JSON.print(f, registry, 4)
    end
end


"""
    save_registry(registry::AbstractDict)
Saves the modified registry dictionary back to disk.
"""
function save_registry(registry::AbstractDict)
    _save_registry(registry)
end

"""
    config_hash(config::Dict)
    config_hash(config::Any)
Generates a SHA-256 hash (truncated to 12 characters) based on the dictionary keys.
Alphabetical sorting ensures that the hash is deterministic.
"""
function config_hash(config::Dict)
    sorted_keys = sort(collect(keys(config)))
    # Convert values to string for hashing
    dict_string = join(["$k=$(config[k])" for k in sorted_keys], "_")
    full_hash = bytes2hex(sha256(dict_string))
    return full_hash[1:12]
end

# If passing a struct convert it before the hash computation
config_hash(config::Any) = config_hash(struct_to_dict(config))

"""
    load_registry()

Loads the JSON registry. If it does not exist, creates the base structure.
"""
function load_registry()
    if isfile(REGISTRY_PATH)
        return JSON.parsefile(REGISTRY_PATH)
    else
        return Dict{String,Any}("data" => Dict(), "models" => Dict(), "evaluations" => Dict())
    end
end

"""
    update_registry!(category::String, hash_val::String, config::AbstractDict)
    update_registry!(category::String, hash_val::String, config::Dict)

Saves the configuration in the registry under the specified category.
Valid categories: "data", "models", "evaluations".
"""
function update_registry!(category::String, hash_val::String, config::AbstractDict)
    registry = load_registry()
    registry[category][hash_val] = config

    _save_registry(registry)
end

# Specialized for the struct
function update_registry!(category::String, hash_val::String, config)
    update_registry!(category, hash_val, struct_to_dict(config))
end

"""
    check_registry(category::String, hash_val::String)

Checks if a hash already exists in a specific category.
"""
function check_registry(category::String, hash_val::String)
    registry = load_registry()
    return haskey(registry[category], hash_val)
end

end # module
