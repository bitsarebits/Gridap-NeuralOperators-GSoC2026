import { useEffect, useRef, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    BrainCircuit,
    Loader2,
    Play,
    AlertCircle,
    CheckCircle2,
    CircleDashed,
    Brain,
    Database,
    LineChart,
    XCircle,
    Activity,
    Server,
} from "lucide-react";

// Schemas & Types
import { formSchema, defaultValues } from "./schemas/simulation";
import type { SimulationFormValues } from "./schemas/simulation";
import {
    type CacheCheckResponse,
    type SimulationPayload,
    type SimulationResponse,
} from "./types";

// API
import { checkRegistry, pingServer } from "./api";

// Components
import FEMConfig from "./components/forms/FEMConfig";
import ModelConfig from "./components/forms/ModelConfig";
import EvalConfig from "./components/forms/EvalConfig";
import Results from "./components/Results";

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

function App() {
    // Initialize the form with zod
    const methods = useForm<SimulationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: defaultValues,
    });

    // State
    const [serverStatus, setServerStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("connecting");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SimulationResponse | null>(null);
    const [cacheStatus, setCacheStatus] = useState<CacheCheckResponse | null>(
        null,
    );
    const [isCheckingCache, setIsCheckingCache] = useState(false);

    // WebSocket
    const wsRef = useRef<WebSocket | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [progress, setProgress] = useState<{
        epoch: number;
        total: number;
        loss: number;
        eta: number;
    } | null>(null);

    // Watch all the form values
    const formValues = methods.watch();

    // Effects

    // Ping to check the server
    useEffect(() => {
        let isMounted = true;
        let retries = 0;
        const MAX_RETRIES = 48; // 48 * 2.5s = 120 seconds

        const checkServer = async () => {
            const isAlive = await pingServer();
            if (!isMounted) return;

            if (isAlive) {
                if (serverStatus !== "connected") {
                    setServerStatus("connected");
                }
                retries = 0;
            } else {
                retries++;

                setServerStatus((prev) => {
                    // If previously connected => connection lost
                    if (prev === "connected") return "disconnected";

                    // If waiting, set to connection lost only after 120 seconds
                    if (prev === "connecting" && retries > MAX_RETRIES)
                        return "disconnected";

                    // Otherwise show "Booting Engine..."
                    return prev;
                });
            }
        };

        // Do the first check immediately
        checkServer();

        // Set dynamically the timeout to do the check every 2.5 seconds
        const pollingInterval = serverStatus === "connected" ? 15000 : 2500;
        const intervalId = setInterval(checkServer, pollingInterval);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [serverStatus]);

    // Debounce for the cache check
    useEffect(() => {
        // Check if the server is connected
        if (serverStatus !== "connected") return;

        const validation = formSchema.safeParse(formValues);

        // If the user is typing validation fails
        if (!validation.success) {
            setCacheStatus(null);
            return;
        }

        // Set a timer of 600ms
        const timer = setTimeout(async () => {
            setIsCheckingCache(true);
            try {
                const payload = buildPayload(
                    formValues as SimulationFormValues,
                );
                const res = await checkRegistry(payload);
                if (res.status === "success") {
                    setCacheStatus(res);
                }
            } catch (err) {
                console.error("Error while checking the cache registry:", err);
            } finally {
                setIsCheckingCache(false);
            }
        }, 600);

        // Cleanup function: clear the timer
        return () => clearTimeout(timer);
    }, [JSON.stringify(formValues), serverStatus]); // stringify to deeply compare the object

    // Submit handler via WebSocket
    const onSubmit = (data: SimulationFormValues) => {
        setIsLoading(true);
        setError(null);
        setResult(null);
        setProgress(null);
        setStatusMessage("Connecting to Julia Engine...");

        const payload = buildPayload(data);

        // Initialize WebSocket connection
        const socket = new WebSocket("ws://127.0.0.1:8080/ws/simulate");
        wsRef.current = socket;

        socket.onopen = () => {
            setStatusMessage("Starting pipeline...");
            socket.send(JSON.stringify({ action: "start", data: payload }));
        };

        socket.onmessage = (event) => {
            const res = JSON.parse(event.data);

            switch (res.type) {
                case "status":
                    setStatusMessage(res.stage || res.message);
                    break;
                case "progress":
                    setStatusMessage(res.stage);
                    setProgress({
                        epoch: res.epoch,
                        total: res.total_epochs,
                        loss: res.loss,
                        eta: res.eta,
                    });
                    break;
                case "success":
                    setResult(res);
                    setIsLoading(false);
                    setStatusMessage("");
                    socket.close();
                    break;
                case "error":
                    setError(res.message);
                    setIsLoading(false);
                    setStatusMessage("");
                    socket.close();
                    break;
            }
        };

        socket.onerror = () => {
            setError("WebSocket connection failed or lost.");
            setIsLoading(false);
        };

        socket.onclose = () => {
            // Safety check: if closed unexpectedly while loading
            if (isLoading) {
                setIsLoading(false);
            }
        };
    };

    // Handler to manually abort the pipeline
    const handleAbort = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "stop" }));
            setStatusMessage("Aborting... Waiting for Julia threads to yield.");
        }
    };

    // Logic to determinate the current status of the single badge
    const getBadgeState = (exists?: boolean) => {
        if (isCheckingCache) return "loading";
        if (exists === true) return "exists";
        if (exists === false) return "missing";
        return "idle"; // Just loaded page
    };

    // Component to render the cache status badge
    const CacheBadge = ({
        state,
        label,
        icon: Icon,
    }: {
        state: "exists" | "missing" | "loading" | "idle";
        label: string;
        icon: any;
    }) => {
        let style = "bg-slate-100 text-slate-400 border border-slate-200"; // default style (idle)
        let StatusIcon = CircleDashed;

        if (state === "loading") {
            style =
                "bg-blue-50 text-blue-600 border border-blue-200 animate-pulse";
            StatusIcon = Loader2;
        } else if (state === "exists") {
            style = "bg-emerald-100 text-emerald-700 border border-emerald-200";
            StatusIcon = CheckCircle2;
        } else if (state === "missing") {
            style = "bg-rose-50 text-rose-600 border border-rose-200";
            StatusIcon = XCircle;
        }

        return (
            <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${style}`}
            >
                <Icon size={14} />
                <span>{label}</span>
                <StatusIcon
                    size={14}
                    className={
                        state === "loading" ? "animate-spin ml-1" : "ml-1"
                    }
                />
            </div>
        );
    };

    // Initial loader and disconnections
    if (serverStatus !== "connected") {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center flex flex-col items-center animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-6">
                        <BrainCircuit
                            size={64}
                            className="text-blue-600 opacity-20"
                        />
                        <Activity
                            size={32}
                            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${serverStatus === "connecting" ? "text-blue-600 animate-pulse" : "text-red-500"}`}
                        />
                    </div>

                    <h2 className="text-2xl font-bold text-slate-800 mb-2">
                        {serverStatus === "connecting"
                            ? "Booting Engine..."
                            : "Connection Lost"}
                    </h2>

                    <p className="text-slate-500 text-sm mb-8">
                        {serverStatus === "connecting"
                            ? "Waking up the Julia backend and JIT compiling libraries. This can take a few minutes on the first run."
                            : "Cannot reach the Julia server. Please ensure Oxygen.jl is running on port 8080."}
                    </p>

                    <div className="flex items-center justify-center gap-3 text-sm font-semibold bg-slate-50 px-6 py-3 rounded-xl border border-slate-100 w-full">
                        {serverStatus === "connecting" ? (
                            <>
                                <Loader2
                                    size={16}
                                    className="text-blue-500 animate-spin"
                                />
                                <span className="text-blue-700">
                                    Waiting for 127.0.0.1:8080...
                                </span>
                            </>
                        ) : (
                            <>
                                <Server size={16} className="text-red-500" />
                                <span className="text-red-700">
                                    Server Offline
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl">
                {/* Header */}
                <div className="mb-4 border-b pb-6">
                    <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                        <BrainCircuit className="text-blue-600" size={32} />
                        GridapROMs Orchestrator
                    </h1>
                    <p className="text-slate-500 mt-2">
                        Configure High-Fidelity FEM generation and Neural
                        Operator training parameters.
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
                            state={getBadgeState(cacheStatus?.data_exists)}
                            label="FEM Data"
                            icon={Database}
                        />
                        <CacheBadge
                            state={getBadgeState(cacheStatus?.model_exists)}
                            label="Model"
                            icon={Brain}
                        />
                        <CacheBadge
                            state={getBadgeState(cacheStatus?.eval_exists)}
                            label="Evaluation"
                            icon={LineChart}
                        />
                    </div>
                </div>

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
                        {/* Grid structure for the sub-components */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <FEMConfig isLoading={isLoading} />
                            <div className="space-y-6 flex flex-col">
                                <ModelConfig isLoading={isLoading} />
                                <EvalConfig isLoading={isLoading} />
                            </div>
                        </div>

                        {/* Submit or Abort Buttons Area */}
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

                                    {/* Progress details and Bar (Visible only during Neural Training) */}
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

                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={handleAbort}
                                    className="w-full lg:w-auto font-bold py-4 px-8 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg bg-red-600 hover:bg-red-700 text-white hover:shadow-red-500/30 shrink-0"
                                >
                                    <XCircle size={20} />
                                    Abort Pipeline
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    className="w-full lg:w-auto font-bold py-4 px-10 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg bg-slate-900 hover:bg-blue-600 text-white hover:shadow-blue-500/30 shrink-0"
                                >
                                    <Play size={20} fill="currentColor" />
                                    Launch Pipeline
                                </button>
                            )}
                        </div>
                    </form>
                </FormProvider>
            </div>

            {/* Results component */}
            {result && result.eval_hash && result.image_url && !isLoading && (
                <Results
                    plotHash={result.eval_hash}
                    imageUrl={result.image_url}
                />
            )}
        </div>
    );
}

export default App;
