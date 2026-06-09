module FNOArch

using Lux
using NeuralOperators
using NNlib

export build_fno

"""
    build_fno(; in_channels=1, out_channels=50, hidden_channels=(64, 64, 128), modes=(32,))

Constructs the Fourier Neural Operator (FNO) model.
FNO maps functions to functions directly on the grid via Fourier
transforms. Therefore, it does not require explicit sensor locations (`x_sensors`)
or the physical domain length (`L`) during initialization.

# Keyword Arguments
- `in_channels::Int`: Number of input channels (e.g., 1 for the initial condition u0).
- `out_channels::Int`: Number of output channels. In this pipeline, this corresponds
  to the number of reduced time steps (`N_t_red`) being predicted simultaneously.
- `hidden_channels::Tuple`: A tuple specifying the number of channels in the hidden
  Fourier layers.
- `modes::Tuple`: A tuple specifying the number of lower-frequency Fourier modes to
  retain (e.g., `(32,)`).

# Returns
- `fno`: The initialized FourierNeuralOperator architecture.
"""
function build_fno(;
    in_channels::Int=1,
    out_channels::Int=50,
    hidden_channels::Tuple=(64, 64, 128),
    modes::Tuple=(32,)
)
    # Dynamically construct the full channel tuple: (in, hidden..., out)
    chs = (in_channels, hidden_channels..., out_channels)

    fno = NeuralOperators.FourierNeuralOperator(
        NNlib.gelu; chs=chs, modes=modes
    )

    return fno
end

end # module
