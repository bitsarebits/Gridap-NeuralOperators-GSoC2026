import {
    ChevronDown,
    Book,
    Activity,
    Grid,
    Layers,
    Network,
    Settings,
} from "lucide-react";

// Helper component for expandable sections
function Accordion({
    title,
    icon: Icon,
    defaultOpen = false,
    children,
}: {
    title: string;
    icon?: any;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    return (
        <details
            className="group border border-slate-200 rounded-xl bg-white shadow-sm mb-4"
            open={defaultOpen}
        >
            <summary className="flex items-center justify-between cursor-pointer p-5 font-bold text-slate-800 hover:bg-slate-50 transition-colors rounded-xl group-open:rounded-b-none group-open:border-b border-slate-200 select-none">
                <div className="flex items-center gap-3">
                    {Icon && <Icon className="text-blue-600" size={20} />}
                    <span className="text-lg">{title}</span>
                </div>
                <ChevronDown
                    className="text-slate-400 transition-transform duration-300 group-open:-rotate-180"
                    size={20}
                />
            </summary>
            <div className="p-6 text-slate-600 space-y-4">{children}</div>
        </details>
    );
}

export default function DocsView() {
    return (
        <div className="w-full max-w-5xl mx-auto">
            {/* Header & Credits */}
            <header className="mb-8 p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
                <h1 className="text-3xl font-extrabold text-slate-900 mb-4">
                    Dashboard Documentation
                </h1>
                <p className="text-lg text-slate-600 mb-6">
                    Welcome to the <strong>GridapROMs Orchestrator</strong>.
                    This interface is designed to configure, run, and evaluate
                    High-Fidelity Finite Element (FE) simulations and Neural
                    Operator training pipelines directly from your browser.
                </p>
                <div className="bg-slate-50 border-l-4 border-slate-300 p-4 rounded-r-lg text-sm text-slate-700">
                    <strong className="block text-slate-800 mb-1">
                        References & Credits
                    </strong>
                    <ul className="list-none space-y-2">
                        <li>
                            • Developed as part of the{" "}
                            <a
                                href="https://summerofcode.withgoogle.com/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline font-semibold"
                            >
                                Google Summer of Code (GSoC) 2026
                            </a>{" "}
                            program under the{" "}
                            <a
                                href="https://numfocus.org/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline font-semibold"
                            >
                                NumFOCUS
                            </a>{" "}
                            umbrella, for the{" "}
                            <a
                                href="https://gridap.github.io/Gridap.jl/stable/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline font-semibold"
                            >
                                Gridap
                            </a>{" "}
                            organization.
                        </li>
                        <li>
                            • The physical problem is based on{" "}
                            <em>
                                "Reduced Basis Methods for Partial Differential
                                Equations"
                            </em>{" "}
                            by A. Quarteroni.
                        </li>
                        <li>
                            • Model architectural concepts are powered by the{" "}
                            <a
                                href="https://docs.sciml.ai/NeuralOperators/stable/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                NeuralOperators.jl
                            </a>{" "}
                            and <span className="font-semibold">Lux.jl</span>{" "}
                            ecosystem.
                        </li>
                        <li>
                            • High-Fidelity snapshots are generated via{" "}
                            <a
                                href="https://github.com/gridap/Gridap.jl"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                Gridap.jl
                            </a>{" "}
                            and{" "}
                            <a
                                href="https://github.com/gridap/GridapROMs.jl"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                GridapROMs.jl
                            </a>
                            .
                        </li>
                    </ul>
                </div>
            </header>

            {/* Accordions */}
            <Accordion
                title="The Physical Problem (1D Transport)"
                icon={Book}
                defaultOpen={true}
            >
                <p>
                    The underlying physical problem used for these experiments
                    is the one-dimensional linear transport equation. It tracks
                    the movement of a quantity (a Gaussian wave) over time and
                    space:
                </p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 my-4 font-mono text-center text-slate-800">
                    ∂<sub>t</sub>u(x,t) + c ∂<sub>x</sub>u(x,t) = 0,
                    &nbsp;&nbsp; (x,t) ∈ ℝ × (0, t<sub>f</sub>)
                </div>
                <p>
                    The exact solution is a traveling wave:{" "}
                    <em>
                        u(x,t) = u<sub>0</sub>(x - ct)
                    </em>
                    . Our initial condition{" "}
                    <em>
                        u<sub>0</sub>(x)
                    </em>{" "}
                    is a Gaussian pulse governed by its variance{" "}
                    <strong>σ</strong>. We map this via the parameter{" "}
                    <strong>β</strong> (where σ = 10<sup>-β</sup>).
                </p>
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-blue-900 mt-4 text-sm">
                    <strong>Why this specific problem?</strong> As Quarteroni
                    notes, when the variance σ becomes very small, the
                    eigenvalues of the correlation matrix show almost no decay.
                    Standard linear Reduced Order Models (ROMs) struggle heavily
                    in this scenario. Neural Operators are employed here to
                    bypass this limitation and build nonlinear surrogates
                    capable of retaining accuracy.
                </div>
            </Accordion>

            <Accordion
                title="Finite Element (FEM) Setup Parameters"
                icon={Grid}
            >
                <p>
                    These parameters govern the high-fidelity data generation
                    via{" "}
                    <code className="bg-slate-100 px-1 py-0.5 rounded text-sm text-slate-800">
                        Gridap.jl
                    </code>
                    .
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
                    <li>
                        <strong>beta_start / beta_end / step:</strong> Define
                        the parameter space grid for generating snapshots. σ
                        values are sampled from 10<sup>-beta_start</sup> to 10
                        <sup>-beta_end</sup>.
                    </li>
                    <li>
                        <strong>nx:</strong> Number of spatial partitions for
                        the FEM mesh. Higher values increase resolution but also
                        compute time.
                    </li>
                    <li>
                        <strong>L:</strong> Domain half-length [-L, L]. The
                        physical space is evaluated from -L to +L.
                    </li>
                    <li>
                        <strong>order:</strong> Polynomial degree of the Finite
                        Element space.
                    </li>
                    <li>
                        <strong>dt / tf:</strong> Time step size and final
                        simulation time.
                    </li>
                    <li>
                        <strong>c:</strong> Advection velocity of the traveling
                        wave.
                    </li>
                    <li>
                        <strong>theta:</strong> Theta-method integration
                        parameter for the time stepper.
                    </li>
                    <li>
                        <strong>sigma_test:</strong> An unseen physical
                        parameter used strictly for <em>Zero-Shot</em>{" "}
                        evaluation after training.
                    </li>
                </ul>
            </Accordion>

            <Accordion title="Fourier Neural Operator (FNO)" icon={Activity}>
                <p>
                    FNOs map functions to functions directly on the grid via
                    Fourier transforms. By converting convolution operations
                    into pointwise multiplications in frequency space, they
                    achieve immense computational speed. Because they operate
                    globally on the grid, they do not require explicit sensor
                    locations during initialization.
                </p>

                {/* Schematic */}
                <div className="bg-slate-800 text-green-400 p-4 rounded-lg font-mono text-xs sm:text-sm my-4 overflow-x-auto whitespace-pre">
                    {`Input Space ──[ Lift ]──> [ Fourier Layer 1...N ] ──[ Project ]──> Output Space
                                     │
                        (FFT ──> Truncate Modes ──> IFFT)`}
                </div>

                <h4 className="font-bold text-slate-800 mt-6 mb-2 border-b pb-1">
                    FNO Architecture & Parameters
                </h4>
                <ul className="space-y-2 text-sm">
                    <li>
                        <strong>batch_size:</strong> Defines the number of
                        parameter scenarios processed at once. Passing the full
                        spatio-temporal tensor requires significant RAM,
                        especially in 3D.
                    </li>
                    <li>
                        <strong>nx_red / nt_red:</strong> Spatial and temporal
                        nodes retained. Because the FEM data can be huge, it is
                        often downsampled (reduced) before FNO training to fit
                        in memory. <em>nt_red</em> strictly dictates the
                        `out_channels` of the network.
                    </li>
                    <li>
                        <strong>modes:</strong> The number of lower-frequency
                        Fourier modes retained. Higher frequencies are
                        truncated, which acts as a form of regularization.
                    </li>
                    <li>
                        <strong>hidden_channels:</strong> A tuple defining the
                        width of the internal Fourier layers (e.g.,{" "}
                        <code className="text-slate-800">64, 64, 128</code>).
                    </li>
                </ul>
            </Accordion>

            <Accordion title="DeepONet" icon={Network}>
                <p>
                    DeepONets learn by encoding the input function space (the
                    initial condition) via a <strong>Branch Network</strong>,
                    and the coordinates via a <strong>Trunk Network</strong>.
                    They evaluate orthogonally, taking the dot product of the
                    outputs, making them highly memory-efficient and capable of
                    arbitrary point evaluations.
                </p>

                {/* Schematic */}
                <div className="bg-slate-800 text-green-400 p-4 rounded-lg font-mono text-xs sm:text-sm my-4 overflow-x-auto whitespace-pre">
                    {`Sensors u(x) ────[ Branch Net ]────> β (p_latent) ──╮
                                                              (Dot Product) ──> u(x,t)
Coords (x, t) ───[ Trunk Net  ]────> t (p_latent) ──╯`}
                </div>

                <h4 className="font-bold text-slate-800 mt-6 mb-2 border-b pb-1">
                    DeepONet Architecture & Parameters
                </h4>
                <ul className="space-y-2 text-sm">
                    <li>
                        <strong>batch_size:</strong> Defaults to 0 (Full Batch).
                        Because the physical grid is static, batching over the
                        initial parameters has minimal memory overhead.
                    </li>
                    <li>
                        <strong>step_x / step_t:</strong> Subsampling factors
                        for spatial and temporal domains respectively to extract
                        the training data points.
                    </li>
                    <li>
                        <strong>m_sensors:</strong> Number of discrete points
                        extracted from the initial condition. Distributed evenly
                        across the domain <em>[-L, L]</em> to feed the Branch
                        network.
                    </li>
                    <li>
                        <strong>p_latent:</strong> Dimension of the latent space
                        (size of the output vectors before the final dot
                        product).
                    </li>
                    <li>
                        <strong>hidden:</strong> Number of neurons in the dense
                        layers of both Branch and Trunk networks.
                    </li>
                </ul>
            </Accordion>

            <Accordion title="NOMAD" icon={Layers}>
                <p>
                    Nonlinear Manifold Decoders (NOMADs) share similarities with
                    DeepONets but rely on deep nonlinear decoding instead of a
                    linear dot product. The Encoder maps the input function
                    space to a latent representation, which is then concatenated
                    directly with the <em>(x, t)</em> coordinate space before
                    passing through the Decoder.
                </p>

                {/* Schematic */}
                <div className="bg-slate-800 text-green-400 p-4 rounded-lg font-mono text-xs sm:text-sm my-4 overflow-x-auto whitespace-pre">
                    {`Sensors u(x) ──[ Encoder ]──> β (p_latent) ──╮
                                                 [ Concat ] ──[ Decoder ] ──> u(x,t)
Coords (x, t) ─────────────────────────────────╯`}
                </div>

                <h4 className="font-bold text-slate-800 mt-6 mb-2 border-b pb-1">
                    NOMAD Architecture & Parameters
                </h4>
                <ul className="space-y-2 text-sm">
                    <li>
                        <strong>batch_size:</strong> Works on a strict
                        point-level basis. A batch size of 2048 means passing
                        2048 individual <em>(x,t)</em> coordinates. RAM impact
                        per step is minimal, but convergence requires many
                        iterations.
                    </li>
                    <li>
                        <strong>m_sensors:</strong> Number of input sensors for
                        the Encoder network.
                    </li>
                    <li>
                        <strong>p_latent:</strong> Dimension of the encoded
                        latent code β. The decoder will subsequently process
                        inputs of size <em>p_latent + 2</em>.
                    </li>
                    <li>
                        <strong>hidden:</strong> Number of neurons in the hidden
                        dense layers.
                    </li>
                </ul>
            </Accordion>

            <Accordion title="Optimizers & Technical Setup" icon={Settings}>
                <p>
                    To ensure stability and correct execution during the
                    exploratory phase, several architectural settings are
                    hardcoded in the Julia backend configuration:
                </p>
                <ul className="list-disc list-inside space-y-2 mt-4 text-sm">
                    <li>
                        <strong>Loss Function:</strong> Fixed to Mean Squared
                        Error (MSELoss).
                    </li>
                    <li>
                        <strong>Optimizer:</strong> Locked to Adam.
                    </li>
                    <li>
                        <strong>Activation Functions:</strong>
                        <ul className="list-[circle] list-inside ml-6 mt-1 text-slate-500">
                            <li>
                                FNO & NOMAD:{" "}
                                <code className="bg-slate-100 px-1 rounded text-slate-800">
                                    gelu
                                </code>
                            </li>
                            <li>
                                DeepONet:{" "}
                                <code className="bg-slate-100 px-1 rounded text-slate-800">
                                    tanh
                                </code>
                            </li>
                        </ul>
                    </li>
                    <li>
                        <strong>Automatic Differentiation:</strong> Handled
                        seamlessly via{" "}
                        <code className="bg-slate-100 px-1 rounded text-slate-800">
                            Enzyme.jl
                        </code>{" "}
                        and accelerated via{" "}
                        <code className="bg-slate-100 px-1 rounded text-slate-800">
                            Reactant.jl
                        </code>{" "}
                        (XLA).
                    </li>
                </ul>

                <h4 className="font-bold text-slate-800 mt-6 mb-2 border-b pb-1">
                    Configurable Learning Rate Schedulers
                </h4>
                <p className="text-sm">
                    You can select the scheduling policy directly from the UI:
                </p>
                <ul className="space-y-2 text-sm mt-2">
                    <li>
                        <strong>Cosine Annealing:</strong> Decreases the
                        learning rate smoothly from <em>lr_max</em> to{" "}
                        <em>lr_min</em> following a half-cosine wave.
                    </li>
                    <li>
                        <strong>ReduceLROnPlateau:</strong> Monitors the loss
                        and applies a multiplicative <em>factor</em> to the
                        learning rate if no improvement is seen for a set number
                        of epochs (<em>patience</em>).
                    </li>
                </ul>
            </Accordion>

            {/* Footer Disclaimer */}
            <div className="mt-8 pt-6 border-t border-slate-200 text-xs text-slate-400 text-center leading-relaxed px-4">
                "Google Summer of Code" and "GSoC" are trademarks of Google.
                NumFOCUS is a trademark of NumFOCUS. This project is an
                independent open-source contribution and is not officially
                endorsed by or affiliated with Google or NumFOCUS.
            </div>
        </div>
    );
}
