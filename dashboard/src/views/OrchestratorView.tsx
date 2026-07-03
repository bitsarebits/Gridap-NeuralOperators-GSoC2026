import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Loader2,
    Play,
    AlertCircle,
    Brain,
    Database,
    LineChart,
    XCircle,
    CheckCircle,
} from "lucide-react";

// Schemas & Types
import { formSchema, defaultValues } from "../schemas/simulation";
import type { SimulationFormValues } from "../schemas/simulation";
import { type SimulationPayload } from "../types";

// Components
import FEMConfig from "../components/forms/FEMConfig";
import ModelConfig from "../components/forms/ModelConfig";
import EvalConfig from "../components/forms/EvalConfig";
import Results from "../components/Results";
import CacheBadge from "../components/ui/CacheBadge";

// Custom Hooks
import { useServerCache } from "../hooks/useServerCache";
import { useSimulationSocket } from "../hooks/useSimulationWebSocket";

// Helper: Build the payload
const buildPayload = (data: SimulationFormValues): SimulationPayload => {
    return {
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
        solver:
            data.model_type === "DeepONet"
                ? {
                      type: "DeepONet",
                      epochs: data.epochs,
                      step_x: data.step_x!,
                      step_t: data.step_t!,
                      m_sensors: data.m_sensors!,
                      p_latent: data.p_latent!,
                      hidden: data.hidden!,
                  }
                : {
                      type: "FNO",
                      epochs: data.epochs,
                      nx_red: data.nx_red!,
                      nt_red: data.nt_red!,
                      hidden_channels: data.hidden_channels!,
                      modes: data.modes!,
                  },

        scheduler:
            data.lr_scheduler_type === "CosineAnnealing"
                ? {
                      type: "CosineAnnealing",
                      ca_lr_max: data.ca_lr_max!,
                      ca_lr_min: data.ca_lr_min!,
                  }
                : {
                      type: "ReduceLROnPlateau",
                      rop_start_lr: data.rop_start_lr!,
                      rop_min_lr: data.rop_min_lr!,
                      rop_factor: data.rop_factor!,
                      rop_patience: data.rop_patience!,
                  },
    };
};

// Helper: Format ETA to mm:ss
const formatETA = (seconds: number) => {
    if (!seconds || seconds < 0) return "Calculating...";
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
};

interface Props {
    serverStatus: "connected" | "connecting" | "disconnected";
}

export default function OrchestratorView({ serverStatus }: Props) {
    // Initialize the form with zod
    const methods = useForm<SimulationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: defaultValues,
    });

    // Watch all the form values
    const formValues = methods.watch();
    const isValid = formSchema.safeParse(formValues).success;
    const currentPayload = isValid
        ? buildPayload(formValues as SimulationFormValues)
        : null;

    // Custom hooks
    const { refreshCache, cacheStatus, isCheckingCache, cacheError } =
        useServerCache(currentPayload, isValid, serverStatus);

    const {
        isLoading,
        error,
        result,
        statusMessage,
        progress,
        startSimulation,
        abortSimulation,
        clearResult,
    } = useSimulationSocket(serverStatus);

    const onSubmit = async (data: SimulationFormValues) => {
        try {
            await startSimulation(buildPayload(data));
            await refreshCache();
        } catch (error) {
            console.error("Simulation failed:", error);
        }
    };

    return (
        <div className="flex flex-col items-center gap-8 w-full">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl">
                {/* Header */}
                <div className="mb-6 border-b border-slate-100 pb-4 flex flex-col gap-1">
                    <h2 className="text-2xl font-bold text-slate-800">
                        Simulation & Training Setup
                    </h2>
                    <p className="text-slate-500 text-sm">
                        Define the high-fidelity FEM physical boundaries and
                        configure the neural operator hyperparameters.
                    </p>
                </div>

                {/* Cache Status Bar */}
                <div className="mb-4 flex flex-col items-start gap-3">
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100 shadow-sm">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        Backend Online
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        System Cache Status
                    </span>
                    <div className="flex gap-2">
                        <CacheBadge
                            exists={cacheStatus?.data_exists}
                            isChecking={isCheckingCache}
                            label="FEM Data"
                            icon={Database}
                        />
                        <CacheBadge
                            exists={cacheStatus?.model_exists}
                            isChecking={isCheckingCache}
                            label="Model"
                            icon={Brain}
                        />
                        <CacheBadge
                            exists={cacheStatus?.eval_exists}
                            isChecking={isCheckingCache}
                            label="Evaluation"
                            icon={LineChart}
                        />
                    </div>
                </div>

                {/* CACHE ERROR BANNER */}
                {cacheError && (
                    <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 animate-in fade-in duration-300">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{cacheError}</span>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-center gap-3 rounded-r-lg">
                        <AlertCircle className="text-red-500 shrink-0" />
                        <p className="text-red-700 text-sm font-medium">
                            {error}
                        </p>
                    </div>
                )}

                {/* Form */}
                <FormProvider {...methods}>
                    <form
                        onSubmit={methods.handleSubmit(onSubmit)}
                        className="space-y-8"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <FEMConfig isLoading={isLoading} />
                            <div className="space-y-6 flex flex-col">
                                <ModelConfig isLoading={isLoading} />
                                <EvalConfig isLoading={isLoading} />
                            </div>
                        </div>

                        {/* Submit / Abort Area */}
                        <div className="border-t pt-6 flex flex-col lg:flex-row justify-end items-center gap-4">
                            {isLoading && (
                                <div className="flex-1 w-full bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col gap-3">
                                    <div className="flex justify-between items-center text-sm font-semibold text-slate-700">
                                        <span className="flex items-center gap-2">
                                            <Loader2
                                                size={16}
                                                className="animate-spin text-blue-600"
                                            />
                                            {statusMessage}
                                        </span>
                                        {progress && (
                                            <span className="text-slate-500 tabular-nums">
                                                ETA: {formatETA(progress.eta)}
                                            </span>
                                        )}
                                    </div>
                                    {progress && (
                                        <div className="space-y-1.5 animate-in fade-in duration-300">
                                            <div className="flex justify-between text-xs text-slate-500 font-medium px-1">
                                                <span>
                                                    Epoch: {progress.epoch} /{" "}
                                                    {progress.total}
                                                </span>
                                                <span className="tabular-nums">
                                                    Loss:{" "}
                                                    {progress.loss.toExponential(
                                                        4,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                                                    style={{
                                                        width: `${(progress.epoch / progress.total) * 100}%`,
                                                    }}
                                                ></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* SUCCESS FEEDBACK BLOCK */}
                            {!isLoading && result && (
                                <div className="flex-1 w-full bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in duration-500">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle
                                            className="text-emerald-600 shrink-0"
                                            size={24}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-emerald-800">
                                                Pipeline Completed Successfully!
                                            </span>
                                            <span className="text-xs text-emerald-600 font-medium">
                                                Scroll down to view the
                                                zero-shot evaluation plots.
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            window.scrollTo({
                                                top: document.body.scrollHeight,
                                                behavior: "smooth",
                                            })
                                        }
                                        className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                                    >
                                        View Results
                                    </button>
                                </div>
                            )}

                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={abortSimulation}
                                    className="w-full lg:w-auto font-bold py-4 px-8 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg bg-red-600 hover:bg-red-700 text-white hover:shadow-red-500/30 shrink-0 cursor-pointer"
                                >
                                    <XCircle size={20} />
                                    Abort Pipeline
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    className="w-full lg:w-auto font-bold py-4 px-10 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg bg-slate-900 hover:bg-blue-600 text-white hover:shadow-blue-500/30 shrink-0 cursor-pointer"
                                >
                                    <Play size={20} fill="currentColor" />
                                    Launch Pipeline
                                </button>
                            )}
                        </div>
                    </form>
                </FormProvider>
            </div>

            {/* Results */}
            {result && result.eval_hash && result.image_url && !isLoading && (
                <Results result={result} onReset={clearResult} />
            )}
        </div>
    );
}
