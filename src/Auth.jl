module Auth

using JSON3

export get_firebase_credentials

"""
    get_firebase_credentials()

Checks if the Firebase credentials file exists in the project root.
Returns a parsed dictionary if found, or `nothing` if the file is missing.
"""
function get_firebase_credentials()
    root_dir = joinpath(@__DIR__, "..")
    credentials_file = joinpath(root_dir, "firebase-auth.json")

    if !isfile(credentials_file)
        return nothing
    end

    try
        file_content = read(credentials_file, String)
        return JSON3.read(file_content, Dict{String,Any})
    catch e
        @error "Failed to parse Firebase credentials JSON file" exception=(e, catch_backtrace())
        return nothing
    end
end

end # module
