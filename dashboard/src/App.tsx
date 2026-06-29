import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formSchema, defaultValues } from "./schema";
import type { SimulationFormValues } from "./schema";
import {
    Play,
    Settings2,
    Activity,
    BrainCircuit,
    Loader2,
    AlertCircle,
} from "lucide-react";
import { runSimulation } from "./api";
import type { SimulationPayload } from "./api";

function App() {
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<SimulationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: defaultValues,
    });

    // State for UI feedback
    const [isLoading, setIsLoading] = useState(false);
    const [plotHash, setPlotHash] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const selectedModel = watch("model_type");
    const selectedScheduler = watch("lr_scheduler_type");

    const onSubmit = async (data: SimulationFormValues) => {
        // Reset previous states
        setIsLoading(true);
        setError(null);
        setPlotHash(null);
        setImageUrl(null);

        // Package the data to match Julia structs (FEMConfig, Solver, EvalConfig)
        const payload = {
            fem_config: {
                beta_start: data.beta_start,
                beta_end: data.beta_end,
                beta_step: data.beta_step,
                order: data.order,
                L: data.L,
                nx: data.nx,
                t0: data.t0,
                dt: data.dt,
                tf: data.tf,
                c: data.c,
                theta: data.theta,
            },
            eval_config: {
                sigma_test: data.sigma_test,
            },
            solver: {
                type: data.model_type,
                epochs: data.epochs,
                // Extract DeepONet vs FNO parameters dynamically
                ...(data.model_type === "DeepONet"
                    ? {
                          step_x: data.step_x,
                          step_t: data.step_t,
                          m_sensors: data.m_sensors,
                          p_latent: data.p_latent,
                          hidden: data.hidden,
                      }
                    : {
                          nx_red: data.nx_red,
                          nt_red: data.nt_red,
                          hidden_channels: data.hidden_channels,
                          modes: data.modes,
                      }),
            },
            scheduler: {
                type: data.lr_scheduler_type,
                // Extract Scheduler parameters dynamically
                ...(data.lr_scheduler_type === "CosineAnnealing"
                    ? { ca_lr_max: data.ca_lr_max, ca_lr_min: data.ca_lr_min }
                    : {
                          rop_start_lr: data.rop_start_lr,
                          rop_min_lr: data.rop_min_lr,
                          rop_factor: data.rop_factor,
                          rop_patience: data.rop_patience,
                      }),
            },
        };

        const typedPayload = payload as SimulationPayload;

        console.log("Payload sent to Julia:", typedPayload);

        try {
            // Call the Julia backend
            const response = await runSimulation(typedPayload);

            if (response.status === "success") {
                // Save the hash to trigger the image rendering
                setPlotHash(response.eval_hash ?? null);
                setImageUrl(response.image_url ?? null);
            } else {
                setError("Simulation failed on the server.");
            }
        } catch (err) {
            console.error(err);
            setError(
                "Failed to connect to the Julia backend. Make sure the server is running on port 8080.",
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl">
                <div className="mb-8 border-b pb-4">
                    <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                        <BrainCircuit className="text-blue-600" size={32} />
                        GridapROMs Orchestrator
                    </h1>
                    <p className="text-slate-500 mt-2">
                        Configure High-Fidelity FEM generation and Neural
                        Operator training parameters.
                    </p>
                </div>

                {/* Display Error Message if any */}
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-center gap-3 rounded-r-lg">
                        <AlertCircle className="text-red-500" />
                        <p className="text-red-700 text-sm font-medium">
                            {error}
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    {/* MAIN GRID: 2 COLUMNS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* LEFT COLUMN: PHYSICS AND FEM */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                            <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <Activity
                                    size={20}
                                    className="text-emerald-600"
                                />
                                FEM Generation (1D Transport)
                            </h2>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Beta Parameter Space */}
                                <div className="col-span-2 bg-white p-3 rounded shadow-sm border border-slate-100">
                                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                                        Parameter Space (Beta)
                                    </p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700">
                                                Start
                                            </label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                disabled={isLoading}
                                                {...register("beta_start", {
                                                    valueAsNumber: true,
                                                })}
                                                className="mt-1 w-full p-2 text-sm border rounded bg-slate-50 disabled:opacity-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700">
                                                End
                                            </label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                disabled={isLoading}
                                                {...register("beta_end", {
                                                    valueAsNumber: true,
                                                })}
                                                className="mt-1 w-full p-2 text-sm border rounded bg-slate-50 disabled:opacity-50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-700">
                                                Step
                                            </label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                disabled={isLoading}
                                                {...register("beta_step", {
                                                    valueAsNumber: true,
                                                })}
                                                className="mt-1 w-full p-2 text-sm border rounded bg-slate-50 disabled:opacity-50"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Mesh & Time */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">
                                        Domain L
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        disabled={isLoading}
                                        {...register("L", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">
                                        nx (Partitions)
                                    </label>
                                    <input
                                        type="number"
                                        disabled={isLoading}
                                        {...register("nx", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">
                                        FEM Order
                                    </label>
                                    <input
                                        type="number"
                                        disabled={isLoading}
                                        {...register("order", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">
                                        Advection (c)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        disabled={isLoading}
                                        {...register("c", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">
                                        dt
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        disabled={isLoading}
                                        {...register("dt", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">
                                        tf (Final Time)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        disabled={isLoading}
                                        {...register("tf", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: NEURAL NETWORK & TRAINING */}
                        <div className="space-y-6">
                            {/* Model Box */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                                        <Settings2 size={20} /> Neural
                                        Architecture
                                    </h2>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide">
                                            Model Type
                                        </label>
                                        <select
                                            disabled={isLoading}
                                            {...register("model_type")}
                                            className="mt-1 w-full p-2 text-sm border border-blue-300 rounded font-semibold text-blue-900 bg-white disabled:opacity-50"
                                        >
                                            <option value="DeepONet">
                                                DeepONet
                                            </option>
                                            <option value="FNO">
                                                Fourier Neural Operator
                                            </option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide">
                                            Epochs
                                        </label>
                                        <input
                                            type="number"
                                            disabled={isLoading}
                                            {...register("epochs", {
                                                valueAsNumber: true,
                                            })}
                                            className="mt-1 w-full p-2 text-sm border border-blue-300 rounded bg-white disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                {/* DYNAMIC RENDER: MODEL ARCHITECTURE */}
                                <div className="bg-white p-4 rounded border border-blue-100">
                                    {selectedModel === "DeepONet" ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Step X
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("step_x", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Step T
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("step_t", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Sensors (m)
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("m_sensors", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Latent (p)
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("p_latent", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-slate-600">
                                                    Hidden Nodes
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("hidden", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    nx reduced
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("nx_red", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    nt reduced
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register("nt_red", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-slate-600">
                                                    Hidden Channels
                                                </label>
                                                <input
                                                    type="text"
                                                    disabled={isLoading}
                                                    {...register(
                                                        "hidden_channels",
                                                    )}
                                                    placeholder="64, 64, 128"
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs text-slate-600">
                                                    Modes
                                                </label>
                                                <input
                                                    type="text"
                                                    disabled={isLoading}
                                                    {...register("modes")}
                                                    placeholder="32"
                                                    className="w-full p-1.5 text-sm border-b disabled:opacity-50"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* LR Scheduler Box */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-sm font-bold text-slate-700 uppercase">
                                        Learning Rate Scheduler
                                    </h2>
                                    <select
                                        disabled={isLoading}
                                        {...register("lr_scheduler_type")}
                                        className="p-1.5 text-sm border rounded bg-white shadow-sm font-medium disabled:opacity-50"
                                    >
                                        <option value="CosineAnnealing">
                                            Cosine Annealing
                                        </option>
                                        <option value="ReduceLROnPlateau">
                                            Reduce LR on Plateau
                                        </option>
                                    </select>
                                </div>

                                {/* DYNAMIC RENDER: SCHEDULER */}
                                <div className="grid grid-cols-2 gap-4">
                                    {selectedScheduler === "CosineAnnealing" ? (
                                        <>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    LR Max
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    disabled={isLoading}
                                                    {...register("ca_lr_max", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    LR Min
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    disabled={isLoading}
                                                    {...register("ca_lr_min", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Start LR
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    disabled={isLoading}
                                                    {...register(
                                                        "rop_start_lr",
                                                        { valueAsNumber: true },
                                                    )}
                                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Min LR
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    disabled={isLoading}
                                                    {...register("rop_min_lr", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Factor
                                                </label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    disabled={isLoading}
                                                    {...register("rop_factor", {
                                                        valueAsNumber: true,
                                                    })}
                                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-600">
                                                    Patience (epochs)
                                                </label>
                                                <input
                                                    type="number"
                                                    disabled={isLoading}
                                                    {...register(
                                                        "rop_patience",
                                                        { valueAsNumber: true },
                                                    )}
                                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Evaluation Box */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <h2 className="text-sm font-bold text-amber-900">
                                        Zero-Shot Evaluation
                                    </h2>
                                    <p className="text-xs text-amber-700">
                                        Test the trained model on an unseen
                                        parameter.
                                    </p>
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-xs font-bold text-amber-800">
                                        Sigma Test
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        disabled={isLoading}
                                        {...register("sigma_test", {
                                            valueAsNumber: true,
                                        })}
                                        className="mt-1 w-full p-2 text-sm border border-amber-300 rounded bg-white disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t pt-6 flex justify-end">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full lg:w-auto font-bold py-4 px-10 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg 
                ${
                    isLoading
                        ? "bg-slate-400 cursor-not-allowed text-slate-200"
                        : "bg-slate-900 hover:bg-blue-600 text-white hover:shadow-blue-500/30"
                }`}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2
                                        size={20}
                                        className="animate-spin"
                                    />
                                    Running Pipeline...
                                </>
                            ) : (
                                <>
                                    <Play size={20} fill="currentColor" />
                                    Launch Pipeline
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* RESULTS SECTION: Rendered only when plotHash and imageUrl are available */}
            {plotHash && imageUrl && !isLoading && (
                <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">
                        Evaluation Results
                    </h2>
                    <p className="text-slate-500 mb-6">
                        Zero-shot prediction vs High-Fidelity FEM data.
                    </p>

                    <div className="border rounded-xl overflow-hidden bg-slate-50 flex justify-center p-4">
                        {/* Dynamic image loading using the exact URL provided by the Julia backend */}
                        <img
                            src={`http://localhost:8080${imageUrl}`}
                            alt={`Plot for hash ${plotHash}`}
                            className="max-w-full h-auto rounded-lg shadow-sm"
                            onError={(e) =>
                                console.error(
                                    "Image not found at URL:",
                                    e.currentTarget.src,
                                )
                            }
                        />
                    </div>

                    <div className="mt-4 flex justify-between items-center text-sm text-slate-500">
                        <p>
                            Hash reference:{" "}
                            <span className="font-mono bg-slate-100 px-2 py-1 rounded">
                                {plotHash}
                            </span>
                        </p>
                        <a
                            href={`http://localhost:8080${imageUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                        >
                            Open Image in New Tab
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
