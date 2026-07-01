import { useState } from "react";
import { LayoutDashboard, Database } from "lucide-react";
import gridapLogo from "./assets/logo-gridap.png";

// Custom Hooks
import { useServerPing } from "./hooks/useServerPing";

// Components & Views
import ServerConnectionScreen from "./components/ui/ServerConnectionScreen";
import OrchestratorView from "./views/OrchestratorView";
import RegistryCatalog from "./views/RegistryCatalog";

function App() {
    const [currentView, setCurrentView] = useState<"orchestrator" | "catalog">(
        "orchestrator",
    );

    // Check for the Julia backend
    const serverStatus = useServerPing();

    // Global Guard: If the backend is compiling or unreachable, lock the entire UI
    if (serverStatus !== "connected") {
        return <ServerConnectionScreen status={serverStatus} />;
    }

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
                    <OrchestratorView serverStatus={serverStatus} />
                ) : (
                    <RegistryCatalog />
                )}
            </main>
        </div>
    );
}

export default App;
