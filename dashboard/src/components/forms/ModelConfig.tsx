import { useFormContext } from "react-hook-form";
import { Settings2 } from "lucide-react";
import type { SimulationFormValues } from "../../schemas/simulation";
import { useEffect } from "react";

interface Props {
    isLoading: boolean;
}

export default function ModelConfig({ isLoading }: Props) {
    // get also watch for the conditional logic
    const { register, watch, setValue } =
        useFormContext<SimulationFormValues>();

    const selectedModel = watch("model_type");
    const selectedScheduler = watch("lr_scheduler_type");

    // Dynamically update the recommended default batch_size when the user switches model type
    useEffect(() => {
        if (selectedModel === "DeepONet") {
            setValue("batch_size", 0);
        } else if (selectedModel === "FNO") {
            setValue("batch_size", 32);
        } else if (selectedModel === "NOMAD") {
            setValue("batch_size", 2048);
        }
    }, [selectedModel, setValue]);

    return (
        <div className="space-y-6">
            {/* Model Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                        <Settings2 size={20} /> Neural Architecture
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
                            <option value="DeepONet">DeepONet</option>
                            <option value="FNO">
                                Fourier Neural Operator (FNO)
                            </option>
                            <option value="NOMAD">NOMAD</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide">
                            Epochs
                        </label>
                        <input
                            type="number"
                            disabled={isLoading}
                            {...register("epochs", { valueAsNumber: true })}
                            className="mt-1 w-full p-2 text-sm border border-blue-300 rounded bg-white disabled:opacity-50"
                        />
                    </div>
                </div>

                {/* Batch Size Field with Explanatory Hint */}
                <div className="mb-4 bg-white p-3 rounded shadow-sm border border-blue-100">
                    <label className="block text-xs font-bold text-slate-700">
                        Batch Size{" "}
                        <span className="italic font-normal text-slate-400">
                            (0 = Full Batch)
                        </span>
                    </label>
                    <input
                        type="number"
                        disabled={isLoading}
                        {...register("batch_size", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border border-slate-300 rounded disabled:opacity-50"
                    />
                    <p className="text-[11px] text-slate-500 mt-2 leading-tight">
                        {selectedModel === "NOMAD"
                            ? "For NOMAD, this dictates the number of flattened coordinate points processed per step. It is highly recommended to use a power of 2 (e.g., 512, 2048) to optimize VRAM."
                            : "For DeepONet and FNO, this dictates how many physics parameters (σ) to process at once. It should preferably be a divisor of the total number of parameters."}
                    </p>
                </div>

                {/* Specific Model Architecture Fields */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded shadow-sm border border-blue-100">
                    {(selectedModel === "DeepONet" ||
                        selectedModel === "NOMAD") && (
                        <>
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
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
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
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
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
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Latent Space (p)
                                </label>
                                <input
                                    type="number"
                                    disabled={isLoading}
                                    {...register("p_latent", {
                                        valueAsNumber: true,
                                    })}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs text-slate-600">
                                    Hidden Neurons
                                </label>
                                <input
                                    type="number"
                                    disabled={isLoading}
                                    {...register("hidden", {
                                        valueAsNumber: true,
                                    })}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                        </>
                    )}

                    {selectedModel === "FNO" && (
                        <>
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Nx Reduced
                                </label>
                                <input
                                    type="number"
                                    disabled={isLoading}
                                    {...register("nx_red", {
                                        valueAsNumber: true,
                                    })}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Nt Reduced
                                </label>
                                <input
                                    type="number"
                                    disabled={isLoading}
                                    {...register("nt_red", {
                                        valueAsNumber: true,
                                    })}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Hidden Channels
                                </label>
                                <input
                                    type="text"
                                    disabled={isLoading}
                                    {...register("hidden_channels")}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                    placeholder="e.g. 64, 64, 128"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Modes
                                </label>
                                <input
                                    type="text"
                                    disabled={isLoading}
                                    {...register("modes")}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                    placeholder="e.g. 32"
                                />
                            </div>
                        </>
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
                                    {...register("rop_start_lr", {
                                        valueAsNumber: true,
                                    })}
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
                                    {...register("rop_patience", {
                                        valueAsNumber: true,
                                    })}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
