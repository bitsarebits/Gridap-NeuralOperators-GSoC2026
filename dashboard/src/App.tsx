import { useState } from "react";
import { LayoutDashboard, Database } from "lucide-react";
import gridapLogo from "./assets/logo-gridap.png";

// Custom Hooks
import { useServerPing } from "./hooks/useServerPing";

// Components & Views
import ServerConnectionScreen from "./components/ui/ServerConnectionScreen";
import OrchestratorView from "./views/OrchestratorView";
import RegistryCatalog from "./views/RegistryCatalog";
import { defaultValues, type SimulationFormValues } from "./schemas/simulation";

// Helper to map backend nested configurations back to the flat React Hook Form state
const mapRegistryToFormValues = (
    modelHash: string,
    modelType: string,
    solverObj: any,
    femObj: any,
): SimulationFormValues => {
    // Determine the base model type string from the solver name
    const formModelType = modelType.includes("FNO")
        ? "FNO"
        : modelType.includes("NOMAD")
          ? "NOMAD"
          : "DeepONet";

    // Handle stringified tuple reconstruction for FNO
    const modesString = Array.isArray(solverObj.modes)
        ? solverObj.modes.join(", ")
        : typeof solverObj.modes === "object"
          ? Object.values(solverObj.modes).join(", ")
          : String(solverObj.modes || defaultValues.modes);

    const hiddenChannelsString = Array.isArray(solverObj.hidden_channels)
        ? solverObj.hidden_channels.join(", ")
        : typeof solverObj.hidden_channels === "object"
          ? Object.values(solverObj.hidden_channels).join(", ")
          : String(solverObj.hidden_channels || defaultValues.hidden_channels);

    // Extract LR Scheduler
    const scheduler = solverObj.lr_scheduler || {};
    const schedulerType = scheduler.type || defaultValues.lr_scheduler_type;

    return {
        // FEM
        beta_start: femObj.beta_start ?? defaultValues.beta_start,
        beta_end: femObj.beta_end ?? defaultValues.beta_end,
        beta_step: femObj.beta_step ?? defaultValues.beta_step,
        order: femObj.order ?? defaultValues.order,
        L: femObj.L ?? defaultValues.L,
        nx: femObj.nx ?? defaultValues.nx,
        t0: femObj.t0 ?? defaultValues.t0,
        dt: femObj.dt ?? defaultValues.dt,
        tf: femObj.tf ?? defaultValues.tf,
        c: femObj.c ?? defaultValues.c,
        theta: femObj.theta ?? defaultValues.theta,

        // Model Base
        model_type: formModelType,
        epochs: solverObj.epochs ?? solverObj.n_epochs ?? defaultValues.epochs,
        batch_size: solverObj.batch_size ?? defaultValues.batch_size,
        pretrained_model_hash: modelHash, // Automatically inject the hash

        // DeepONet / NOMAD specifics
        step_x: solverObj.step_x ?? defaultValues.step_x,
        step_t: solverObj.step_t ?? defaultValues.step_t,
        m_sensors: solverObj.m_sensors ?? defaultValues.m_sensors,
        p_latent: solverObj.p_latent ?? defaultValues.p_latent,
        hidden: solverObj.hidden ?? defaultValues.hidden,

        // FNO specifics
        nx_red: solverObj.nx_red ?? defaultValues.nx_red,
        nt_red: solverObj.nt_red ?? defaultValues.nt_red,
        hidden_channels: hiddenChannelsString,
        modes: modesString,

        // Eval (Fallback to default since we are loading a model, not a specific eval)
        sigma_test: defaultValues.sigma_test,

        // Schedulers
        lr_scheduler_type: schedulerType,
        ca_lr_max: scheduler.lr_max ?? defaultValues.ca_lr_max,
        ca_lr_min: scheduler.lr_min ?? defaultValues.ca_lr_min,
        rop_start_lr: scheduler.start_lr ?? defaultValues.rop_start_lr,
        rop_min_lr: scheduler.min_lr ?? defaultValues.rop_min_lr,
        rop_factor: scheduler.factor ?? defaultValues.rop_factor,
        rop_patience: scheduler.patience ?? defaultValues.rop_patience,
    } as SimulationFormValues;
};

function App() {
    // State
    const [currentView, setCurrentView] = useState<"orchestrator" | "catalog">(
        "orchestrator",
    );
    const [fineTuneData, setFineTuneData] = useState<
        SimulationFormValues | undefined
    >(undefined);

    // Check for the Julia backend
    const serverStatus = useServerPing();

    const handleFineTuneRequest = (
        modelHash: string,
        modelType: string,
        solverConfig: any,
        femConfig: any,
    ) => {
        const prefilledForm = mapRegistryToFormValues(
            modelHash,
            modelType,
            solverConfig,
            femConfig,
        );
        setFineTuneData(prefilledForm);
        setCurrentView("orchestrator");
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center">
            {/* Global Navigation Header */}
            <header className="w-full bg-white border-b shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Brand Logo & Title */}
                    <div className="flex items-center gap-3">
                        <img
                            src={gridapLogo}
                            alt="Gridap Logo"
                            className="h-8 w-auto object-contain"
                        />
                        <span className="font-extrabold text-slate-800 text-xl hidden sm:block">
                            GridapROMs Orchestrator
                        </span>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setCurrentView("orchestrator")}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer text-sm ${
                                currentView === "orchestrator"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <LayoutDashboard size={18} />
                            Pipeline
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentView("catalog")}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer text-sm ${
                                currentView === "catalog"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <Database size={18} />
                            Registry
                        </button>
                    </div>
                </div>
            </header>

            {/* Dynamic View Router Outlet */}
            <main className="w-full max-w-7xl px-4 py-8 flex justify-center">
                {currentView === "orchestrator" ? (
                    serverStatus === "connected" ? (
                        <OrchestratorView
                            serverStatus={serverStatus}
                            initialFormValues={fineTuneData}
                        />
                    ) : (
                        <ServerConnectionScreen status={serverStatus} />
                    )
                ) : (
                    <RegistryCatalog
                        serverIsConnected={serverStatus === "connected"}
                        onFineTune={handleFineTuneRequest}
                    />
                )}
            </main>
        </div>
    );
}

export default App;
