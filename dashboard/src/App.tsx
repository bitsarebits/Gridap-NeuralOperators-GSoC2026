import { useState } from "react";
import { LayoutDashboard, Database, BookOpen } from "lucide-react";
import gridapLogo from "./assets/logo-gridap.png";

// Custom Hooks
import { useServerPing } from "./hooks/useServerPing";

// Components & Views
import ServerConnectionScreen from "./components/ui/ServerConnectionScreen";
import OrchestratorView from "./views/OrchestratorView";
import RegistryCatalog from "./views/RegistryCatalog";
import DocsView from "./views/DocsView";
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

    // Julia serializes FNO tuples as JSON arrays. Other architectures use form defaults
    // for architecture-specific fields that do not apply to them.
    const modesString = solverObj.modes?.join(", ") ?? defaultValues.modes;
    const hiddenChannelsString =
        solverObj.hidden_channels?.join(", ") ?? defaultValues.hidden_channels;

    const scheduler = solverObj.lr_scheduler;
    const schedulerType =
        scheduler.type as SimulationFormValues["lr_scheduler_type"];

    return {
        // FEM
        beta_start: femObj.beta_start,
        beta_end: femObj.beta_end,
        beta_step: femObj.beta_step,
        order: femObj.order,
        L: femObj.L,
        nx: femObj.nx,
        t0: femObj.t0,
        dt: femObj.dt,
        tf: femObj.tf,
        c: femObj.c,
        theta: femObj.theta,

        // Model Base
        model_type: formModelType,
        epochs: solverObj.epochs,
        batch_size: solverObj.batch_size,
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

        // Eval
        sigma_test: defaultValues.sigma_test,

        // Schedulers
        lr_scheduler_type: schedulerType,
        ca_lr_max: scheduler.lr_max ?? defaultValues.ca_lr_max,
        ca_lr_min: scheduler.lr_min ?? defaultValues.ca_lr_min,
        rop_start_lr: scheduler.current_lr ?? defaultValues.rop_start_lr,
        rop_min_lr: scheduler.min_lr ?? defaultValues.rop_min_lr,
        rop_factor: scheduler.factor ?? defaultValues.rop_factor,
        rop_patience: scheduler.patience ?? defaultValues.rop_patience,
    } as SimulationFormValues;
};

function App() {
    // State
    const [currentView, setCurrentView] = useState<
        "orchestrator" | "catalog" | "docs"
    >("orchestrator");
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
        <div className="min-h-screen bg-slate-50 flex flex-col items-center overflow-x-hidden">
            {/* Global Navigation Header */}
            <header className="w-full bg-white border-b shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
                    {/* Brand Logo & Title */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <img
                            src={gridapLogo}
                            alt="Gridap Logo"
                            className="h-7 sm:h-8 w-auto object-contain"
                        />
                        <span className="font-extrabold text-slate-800 text-lg sm:text-xl hidden sm:block">
                            NonlinearROMs
                        </span>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        <button
                            type="button"
                            onClick={() => setCurrentView("docs")}
                            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition-colors cursor-pointer text-xs sm:text-sm ${
                                currentView === "docs"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <BookOpen
                                size={16}
                                className="sm:w-4.5 sm:h-4.5 shrink-0"
                            />
                            <span>Docs</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentView("orchestrator")}
                            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition-colors cursor-pointer text-xs sm:text-sm ${
                                currentView === "orchestrator"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <LayoutDashboard
                                size={16}
                                className="sm:w-4.5 sm:h-4.5 shrink-0"
                            />
                            <span>Pipeline</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentView("catalog")}
                            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition-colors cursor-pointer text-xs sm:text-sm ${
                                currentView === "catalog"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <Database
                                size={16}
                                className="sm:w-4.5 sm:h-4.5 shrink-0"
                            />
                            <span>Registry</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Dynamic View Router Outlet */}
            <main className="w-full max-w-7xl px-3 sm:px-4 py-4 sm:py-8 flex justify-center">
                {currentView === "orchestrator" &&
                    (serverStatus === "connected" ? (
                        <OrchestratorView
                            serverStatus={serverStatus}
                            initialFormValues={fineTuneData}
                        />
                    ) : (
                        <ServerConnectionScreen status={serverStatus} />
                    ))}

                {currentView === "catalog" && (
                    <RegistryCatalog
                        serverIsConnected={serverStatus === "connected"}
                        onFineTune={handleFineTuneRequest}
                    />
                )}

                {currentView === "docs" && <DocsView />}
            </main>
        </div>
    );
}

export default App;
