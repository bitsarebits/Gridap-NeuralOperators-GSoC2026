import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    Database,
    BookOpen,
    Sun,
    Moon,
    ArrowUpRight,
} from "lucide-react";
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
    // Su GitHub Pages apriamo direttamente il Catalogo (Registry) per mostrare subito gli esperimenti
    const [currentView, setCurrentView] = useState<
        "orchestrator" | "catalog" | "docs"
    >(() =>
        typeof window !== "undefined" &&
        window.location.hostname.endsWith("github.io")
            ? "catalog"
            : "orchestrator",
    );

    const [fineTuneData, setFineTuneData] = useState<
        SimulationFormValues | undefined
    >(undefined);

    const [darkMode, setDarkMode] = useState<boolean>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("theme");
            if (saved === "dark" || saved === "light") {
                return saved === "dark";
            }
            return window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
        return false;
    });

    useEffect(() => {
        const root = document.documentElement;
        if (darkMode) {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
    }, [darkMode]);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e: MediaQueryListEvent) => {
            setDarkMode(e.matches);
            localStorage.removeItem("theme");
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    const toggleTheme = () => {
        setDarkMode((prev) => {
            const next = !prev;
            localStorage.setItem("theme", next ? "dark" : "light");
            return next;
        });
    };

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
        <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 flex flex-col items-center overflow-x-hidden">
            {/* Global Navigation Header */}
            <header className="w-full bg-white border-b border-slate-200 shadow-xs sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-1 sm:gap-2">
                    {/* Brand Logo & Title */}
                    <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                        <img
                            src={gridapLogo}
                            alt="Gridap Logo"
                            className="h-7 sm:h-8 w-auto object-contain shrink-0"
                        />
                        <span className="font-extrabold text-slate-800 text-base sm:text-xl hidden md:block">
                            NonlinearROMs
                        </span>
                    </div>

                    {/* Navigation Tabs & Theme Toggle */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCurrentView("docs")}
                            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition-colors cursor-pointer text-xs sm:text-sm ${
                                currentView === "docs"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <BookOpen
                                size={15}
                                className="sm:w-4.5 sm:h-4.5 shrink-0"
                            />
                            <span>Docs</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setCurrentView("orchestrator")}
                            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition-colors cursor-pointer text-xs sm:text-sm ${
                                currentView === "orchestrator"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <LayoutDashboard
                                size={15}
                                className="sm:w-4.5 sm:h-4.5 shrink-0"
                            />
                            <span>Pipeline</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setCurrentView("catalog")}
                            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg font-semibold transition-colors cursor-pointer text-xs sm:text-sm ${
                                currentView === "catalog"
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <Database
                                size={15}
                                className="sm:w-4.5 sm:h-4.5 shrink-0"
                            />
                            <span>Registry</span>
                        </button>

                        <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />

                        <a
                            href="https://bitsarebits.github.io/gsoc2026-gridap/"
                            className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:opacity-90 transition-opacity shrink-0"
                            title="Read GSoC 2026 Devlog"
                        >
                            <span>GSoC Blog</span>
                            <ArrowUpRight size={14} />
                        </a>

                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="p-1.5 sm:p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shrink-0"
                            aria-label="Toggle theme"
                            title="Toggle Light / Dark mode"
                        >
                            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
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
                        <ServerConnectionScreen
                            status={serverStatus}
                            onOpenCatalog={() => setCurrentView("catalog")}
                            onOpenDocs={() => setCurrentView("docs")}
                        />
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
