module HashRegistry

using SHA
using JSON
using DrWatson

export config_hash, update_registry!, check_registry

const REGISTRY_PATH = datadir("registry.json")

"""
    config_hash(config::Dict)
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
    update_registry!(category::String, hash_val::String, config::Dict)

Saves the configuration in the registry under the specified category.
Valid categories: "data", "models", "evaluations".
"""
function update_registry!(category::String, hash_val::String, config::Dict)
    registry = load_registry()
    registry[category][hash_val] = config

    open(REGISTRY_PATH, "w") do f
        JSON.print(f, registry, 4)
    end
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
