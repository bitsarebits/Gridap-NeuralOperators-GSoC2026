module NOMADArch

using Lux, NeuralOperators

export build_nomad

"""
    build_nomad(; m_sensors=200, p_latent=64, hidden=64)

Constructs the Nonlinear Manifold Decoder (NOMAD) architecture.
The encoder maps the input function space (sensors) to a latent representation.
The decoder concatenates this latent representation with the coordinate space (x, t)
and outputs the predicted scalar field.
"""
function build_nomad(; m_sensors::Int=200, p_latent::Int=64, hidden::Int=64)
    # Encoder: Maps sensor readings to latent space
    encoder = Chain(
        Dense(m_sensors => hidden, gelu),
        Dense(hidden => hidden, gelu),
        Dense(hidden => p_latent, gelu)
    )

    # Decoder: Takes latent vector + 2 coordinates (x, t), outputs u(x,t)
    decoder = Chain(
        Dense((p_latent + 2) => hidden, gelu),
        Dense(hidden => hidden, gelu),
        Dense(hidden => hidden, gelu),
        Dense(hidden => 1)
    )

    return NOMAD(encoder, decoder)
end

end
