module FirebaseREST

using HTTP
using JSON3
using MbedTLS
using Base64
using Dates
using CodecZlib
using ..Utils: raw_body

# Bring in Auth for the credentials
using ..Auth

export get_access_token, upload_to_storage, push_to_firestore

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
const FIREBASE_SCOPES = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write"

const TOKEN_LOCK = ReentrantLock()
const CACHED_TOKEN = Ref{Union{String,Nothing}}(nothing)
const TOKEN_EXPIRY = Ref{Int}(0)

# JWT implementation

function _base64url_encode(data)
    # Standard Base64
    b64 = base64encode(data)
    # Convert to URL-safe Base64 (RFC 7515)
    b64 = replace(b64, "+" => "-")
    b64 = replace(b64, "/" => "_")
    b64 = replace(b64, "=" => "") # Remove the paddingSS
    return b64
end

function _sign_rs256_jwt(claim::Dict, pem_key::String)
    header = Dict("alg" => "RS256", "typ" => "JWT")

    # Encode Header and Claim
    b64_header = _base64url_encode(JSON3.write(header))
    b64_claim = _base64url_encode(JSON3.write(claim))

    # Concatenate to form the unsigned token
    unsigned_jwt = b64_header * "." * b64_claim

    # Setup MbedTLS C-library Engine
    pk = MbedTLS.PKContext()
    MbedTLS.parse_key!(pk, pem_key)

    # Create SHA-256 Digest
    digest = MbedTLS.digest(MbedTLS.MD_SHA256, unsigned_jwt)

    # Sign the digest with RSA private key
    entropy = MbedTLS.Entropy()
    rng = MbedTLS.CtrDrbg()
    MbedTLS.seed!(rng, entropy)

    signature = MbedTLS.sign(pk, MbedTLS.MD_SHA256, digest, rng)

    # Encode signature and attach
    b64_sig = _base64url_encode(signature)

    return unsigned_jwt * "." * b64_sig
end

"""
    get_access_token()::Union{String, Nothing}

Generates a signed RS256 JWT using MbedTLS and the Service Account credentials,
exchanges it with Google OAuth2, and returns a short-lived Access Token.
"""
function get_access_token()
    now_sec = floor(Int, datetime2unix(now(UTC)))

    lock(TOKEN_LOCK) do
        if !isnothing(CACHED_TOKEN[]) && now_sec < (TOKEN_EXPIRY[] - 60)
            return CACHED_TOKEN[]
        end

        cred = Auth.get_firebase_credentials()
        if isnothing(cred)
            @error "Cannot generate Access Token: Firebase credentials missing."
            return nothing
        end

        client_email = cred["client_email"]
        private_key_pem = cred["private_key"]
        exp_sec = now_sec + 3600

        claim = Dict(
            "iss" => client_email,
            "scope" => FIREBASE_SCOPES,
            "aud" => GOOGLE_TOKEN_URI,
            "exp" => exp_sec,
            "iat" => now_sec
        )

        local signed_jwt::String
        try
            signed_jwt = _sign_rs256_jwt(claim, private_key_pem)
        catch e
            @error "Failed to sign JWT with the provided PEM key" exception=(e, catch_backtrace())
            return nothing
        end

        headers = ["Content-Type" => "application/x-www-form-urlencoded"]
        body = "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=$(signed_jwt)"

        try
            response = HTTP.post(GOOGLE_TOKEN_URI, headers, body; status_exception=false)

            if response.status >= 200 && response.status < 300
                resp_data = JSON3.read(raw_body(response))
                token_str = String(resp_data.access_token)
                CACHED_TOKEN[] = token_str
                TOKEN_EXPIRY[] = exp_sec
                @debug "Google OAuth Access Token successfully retrieved and cached."
                return token_str
            else
                @error "OAuth HTTP Error" status=response.status body=String(raw_body(response))
                return nothing
            end
        catch e
            @error "Network failure during Google Access Token retrieval" exception=(e, catch_backtrace())
            return nothing
        end
    end
end

"""
    check_document_exists(access_token::String, collection::String, document_id::String)

Restituisce `true` se il documento esiste già in Firestore.
"""
function check_document_exists(access_token::String, collection::String, document_id::String)
    cred = Auth.get_firebase_credentials()
    if isnothing(cred)
        return false
    end

    safe_doc_id = HTTP.URIs.escapeuri(String(document_id))
    safe_collection = HTTP.URIs.escapeuri(String(collection))
    firestore_url = "https://firestore.googleapis.com/v1/projects/$(cred["project_id"])/databases/(default)/documents/$(safe_collection)/$(safe_doc_id)"

    headers = ["Authorization" => "Bearer $access_token"]

    try
        # Simple GET. If the answer is 200, it exists. Otherwise it doesn't
        response = HTTP.get(firestore_url, headers; status_exception=false)
        return response.status == 200
    catch
        return false
    end
end

"""
    upload_to_storage(access_token::String, file_path::String, destination_name::String; content_type::String)

Uploads a local file to Firebase Cloud Storage using the REST API.
Default content_type::String="application/octet-stream" for generic binary.
Returns the public download URL if successful.
"""
function upload_to_storage(access_token::String, file_path::String, destination_name::String; content_type::String="application/octet-stream")
    cred = Auth.get_firebase_credentials()
    if isnothing(cred)
        return nothing
    end
    project_id = cred["project_id"]

    if !isfile(file_path)
        @error "File not found: $file_path"
        return nothing
    end

    safe_dest = HTTP.URIs.escapeuri(destination_name)
    bucket_name = "$(project_id).firebasestorage.app"

    raw_bytes = read(file_path)
    is_json = endswith(destination_name, ".json")
    file_bytes = is_json ? transcode(GzipCompressor, raw_bytes) : raw_bytes

    upload_url = "https://storage.googleapis.com/upload/storage/v1/b/$(bucket_name)/o?uploadType=multipart"

    metadata = Dict{String,Any}(
        "name" => destination_name,
        "contentType" => content_type,
        "cacheControl" => "public, max-age=31536000, immutable"
    )
    if is_json
        metadata["contentEncoding"] = "gzip"
    end

    boundary = "===============gridap_gcs_$(rand(UInt64))=="
    body_io = IOBuffer()
    write(body_io, "--$boundary\r\n")
    write(body_io, "Content-Type: application/json; charset=UTF-8\r\n\r\n")
    write(body_io, JSON3.write(metadata), "\r\n")
    write(body_io, "--$boundary\r\n")
    write(body_io, "Content-Type: $content_type\r\n\r\n")
    write(body_io, file_bytes, "\r\n")
    write(body_io, "--$boundary--\r\n")

    headers = [
        "Authorization" => "Bearer $access_token",
        "Content-Type" => "multipart/related; boundary=$boundary"
    ]

    try
        response = HTTP.post(upload_url, headers, take!(body_io); status_exception=false)

        if response.status >= 200 && response.status < 300
            @info "Successfully uploaded $(destination_name) to Firebase Storage ($(length(file_bytes)) bytes)."
            return "https://firebasestorage.googleapis.com/v0/b/$(bucket_name)/o/$(safe_dest)?alt=media"
        else
            @error "Firebase Storage HTTP Error" status=response.status body=String(raw_body(response))
            return nothing
        end
    catch e
        @error "Network failure during Firebase Storage upload" exception=(e, catch_backtrace())
        return nothing
    end
end

"""
    push_to_firestore(access_token::String, collection::String, document_id::String, payload::Dict)

Writes or updates a structured dictionary to Firestore using the REST API.
"""
function push_to_firestore(access_token::String, collection::String, document_id::String, payload::Dict)
    cred = Auth.get_firebase_credentials()
    if isnothing(cred)
        return false
    end
    project_id = cred["project_id"]

    firestore_document = _julia_to_firestore_dict(payload)

    # Use PATCH for Upsert behavior
    safe_doc_id = HTTP.URIs.escapeuri(String(document_id))
    safe_collection = HTTP.URIs.escapeuri(String(collection))
    firestore_url = "https://firestore.googleapis.com/v1/projects/$(project_id)/databases/(default)/documents/$(safe_collection)/$(safe_doc_id)"

    headers = [
        "Authorization" => "Bearer $access_token",
        "Content-Type" => "application/json"
    ]

    body = JSON3.write(Dict("fields" => firestore_document))

    try
        # HTTP.patch to upsert instead of create (post)
        response = HTTP.patch(firestore_url, headers, body; status_exception=false)

        if response.status >= 200 && response.status < 300
            @info "Successfully pushed document $(document_id) to Firestore."
            return true
        else
            @error "Firestore HTTP Error" status=response.status body=String(raw_body(response))
            return false
        end
    catch e
        @error "Network failure during Firestore write" exception=(e, catch_backtrace())
        return false
    end
end

"""
    delete_from_firestore(access_token::String, collection::String, document_id::String)
"""
function delete_from_firestore(access_token::String, collection::String, document_id::String)
    cred = Auth.get_firebase_credentials()
    if isnothing(cred)
        return false
    end

    safe_doc_id = HTTP.URIs.escapeuri(String(document_id))
    safe_collection = HTTP.URIs.escapeuri(String(collection))
    url = "https://firestore.googleapis.com/v1/projects/$(cred["project_id"])/databases/(default)/documents/$(safe_collection)/$(safe_doc_id)"
    headers = ["Authorization" => "Bearer $access_token"]

    try
        response = HTTP.delete(url, headers; status_exception=false)
        return response.status >= 200 && response.status < 300
    catch e
        @error "Firestore Delete Error" exception=(e, catch_backtrace())
        return false
    end
end

"""
    delete_from_storage(access_token::String, destination_name::String)
"""
function delete_from_storage(access_token::String, destination_name::String)
    cred = Auth.get_firebase_credentials()
    if isnothing(cred)
        return false
    end

    bucket_name = "$(cred["project_id"]).firebasestorage.app"
    safe_dest = HTTP.URIs.escapeuri(destination_name)
    url = "https://storage.googleapis.com/storage/v1/b/$(bucket_name)/o/$(safe_dest)"
    headers = ["Authorization" => "Bearer $access_token"]

    try
        response = HTTP.delete(url, headers; status_exception=false)
        return response.status >= 200 && response.status < 300
    catch e
        @error "Storage Delete Error" exception=(e, catch_backtrace())
        return false
    end
end

# ---------------- INTERNAL HELPERS ----------------

function _julia_to_firestore_value(v)
    if isa(v, String) || isa(v, Symbol)
        return Dict("stringValue" => string(v))
    elseif isa(v, Integer)
        return Dict("integerValue" => string(v))
    elseif isa(v, AbstractFloat)
        return Dict("doubleValue" => v)
    elseif isa(v, Bool)
        return Dict("booleanValue" => v)
    elseif isa(v, AbstractVector) || isa(v, Tuple)
        return Dict("arrayValue" => Dict("values" => [_julia_to_firestore_value(i) for i in v]))
    elseif isa(v, AbstractDict)
        fields = Dict{String,Any}()
        for (k, val) in pairs(v)
            fields[string(k)] = _julia_to_firestore_value(val)
        end
        return Dict("mapValue" => Dict("fields" => fields))
    elseif isnothing(v)
        return Dict("nullValue" => "NULL_VALUE")
    else
        return Dict("stringValue" => string(v))
    end
end

function _julia_to_firestore_dict(data::Dict)
    fields = Dict{String,Any}()
    for (k, v) in data
        fields[string(k)] = _julia_to_firestore_value(v)
    end
    return fields
end

end # module
