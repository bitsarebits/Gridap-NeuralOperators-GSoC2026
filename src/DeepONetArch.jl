module DeepONetArch

using Lux
using NeuralOperators

export build_deeponet

"""
    build_deeponet(; m_sensors=100, p_latent=64, hidden=64, L=5.0)

Constructs the DeepONet model and the corresponding sensor grid.
Centralizing this ensures consistency across training, testing, and plotting scripts.

# Keyword Arguments
- `m_sensors::Int`: Number of sensors for the Branch Net input.
- `p_latent::Int`: Dimension of the latent space (output of Branch and Trunk).
- `hidden::Int`: Number of neurons in the hidden layers.
- `L::Float64`: Domain half-length `[-L, L]` to distribute the sensors correctly.

# Returns
- `model`: The initialized DeepONet architecture.
- `x_sensors`: The spatial coordinates of the sensors for the Branch Net.
"""
function build_deeponet(;
    m_sensors::Int=100,
    p_latent::Int=64,
    hidden::Int=64,
    L::Float64=5.0
)
    x_sensors = range(-L, L, length=m_sensors)

    deepONet = NeuralOperators.DeepONet(
        # BRANCH NET
        Chain(
            Dense(m_sensors => hidden, tanh),
            Dense(hidden => hidden, tanh),
            Dense(hidden => hidden, tanh),
            Dense(hidden => p_latent)
        ),
        # TRUNK NET
        Chain(
            Dense(2 => hidden, tanh),
            Dense(hidden => hidden, tanh),
            Dense(hidden => hidden, tanh),
            Dense(hidden => hidden, tanh),
            Dense(hidden => p_latent)
        )
    )

    return deepONet, x_sensors
end

end # module
