module ModelPipeline

using NonlinearROMs
using Lux

export build_solver

function build_solver(config, fesolver)
    model_config = config.model

    model = if model_config.architecture == :deeponet
        DeepONet(
            2, 2;
            width=model_config.width,
            depth=model_config.depth,
            activation=Lux.tanh,
        )
    elseif model_config.architecture == :nomad
        NOMAD(
            2, 2;
            width=model_config.width,
            depth=model_config.depth,
            activation=Lux.tanh,
        )
    else
        throw(ArgumentError(
            "Unsupported architecture: $(model_config.architecture)"
        ))
    end

    strategy = NeuralStrategy(
        model;
        epochs=model_config.epochs,
        batch_size=model_config.batch_size,
        space_step=model_config.space_step,
        time_step=model_config.time_step,
        verbose=true,
        print_every=100,
    )

    reduction = if model_config.architecture == :deeponet
        DeepONetReduction(strategy)
    else
        NOMADReduction(strategy)
    end

    return NeuralSolver(fesolver, reduction)
end

end
