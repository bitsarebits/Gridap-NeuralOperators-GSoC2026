import { useFormContext } from "react-hook-form";
import { GitFork, Settings2 } from "lucide-react";
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

    // Check if the user is fine-tuning an existing model
    const pretrainedHash = watch("pretrained_model_hash");
    const isFineTuning = !!pretrainedHash && pretrainedHash.trim() !== "";

    // Derived disable states
    const disableArch = isLoading || isFineTuning; // Lock architecture if fine-tuning
    const disableAll = isLoading; // Still lock everything if loading

    // Dynamically update the recommended default batch_size when the user switches model type
    useEffect(() => {
        // Only auto-update batch size if we are NOT fine-tuning
        // If we are fine tuning, we want to keep the parent's batch size
        if (!isFineTuning) {
            if (selectedModel === "DeepONet") {
                setValue("batch_size", 0);
            } else if (selectedModel === "FNO") {
                setValue("batch_size", 32);
            } else if (selectedModel === "NOMAD") {
                setValue("batch_size", 2048);
            }
        }
    }, [selectedModel, setValue, isFineTuning]);

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
                            disabled={disableArch}
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
                            disabled={disableAll}
                            {...register("epochs", { valueAsNumber: true })}
                            className="mt-1 w-full p-2 text-sm border border-blue-300 rounded bg-white disabled:opacity-50"
                        />
                    </div>
                </div>

                {/* FINE-TUNING FIELD */}
                <div className="mb-4 bg-indigo-50/50 p-3 rounded shadow-sm border border-indigo-100 flex gap-3 items-start">
                    <div className="p-2 bg-indigo-100 rounded text-indigo-600 mt-0.5 shrink-0">
                        <GitFork size={16} />
                    </div>
                    <div className="w-full">
                        <label className="block text-xs font-bold text-indigo-900">
                            Pre-trained Model Hash{" "}
                            <span className="text-indigo-400 font-normal ml-1">
                                (Optional)
                            </span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. 1a2b3c4d5e6f"
                            disabled={disableAll}
                            {...register("pretrained_model_hash")}
                            className="mt-1 w-full p-2 text-sm border border-indigo-200 rounded font-mono disabled:opacity-50"
                        />
                        <p className="text-[10px] text-indigo-500 mt-1 leading-tight">
                            Leave empty to train from scratch. Provide a valid
                            12-char SHA-256 hash to fine-tune existing weights.
                            <span className="font-semibold ml-1">
                                Architectural parameters will be locked.
                            </span>
                        </p>
                    </div>
                </div>

                {/* Batch Size Field */}
                <div className="mb-4 bg-white p-3 rounded shadow-sm border border-blue-100">
                    <label className="block text-xs font-bold text-slate-700">
                        Batch Size{" "}
                        <span className="italic font-normal text-slate-400">
                            (0 = Full Batch)
                        </span>
                    </label>
                    <input
                        type="number"
                        disabled={disableAll}
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
                <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded shadow-sm border border-blue-100 relative">
                    {/* Visual Overlay when disabled */}
                    {isFineTuning && (
                        <div className="absolute inset-0 bg-slate-50/50 z-10 rounded flex items-center justify-center">
                            <span className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
                                Architecture Locked for Fine-Tuning
                            </span>
                        </div>
                    )}

                    {(selectedModel === "DeepONet" ||
                        selectedModel === "NOMAD") && (
                        <>
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Step X
                                </label>
                                <input
                                    type="number"
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                                    disabled={disableArch}
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
                        disabled={disableAll}
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
                                    disabled={disableAll}
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
                                    disabled={disableAll}
                                    {...register("ca_lr_min", {
                                        valueAsNumber: true,
                                    })}
                                    className="w-full p-1.5 text-sm border rounded disabled:opacity-50"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            {/* ... (plateau inputs disabled={disableAll}) */}
                            <div>
                                <label className="block text-xs text-slate-600">
                                    Start LR
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    disabled={disableAll}
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
                                    disabled={disableAll}
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
                                    disabled={disableAll}
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
                                    disabled={disableAll}
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
