import {
    BrainCircuit,
    Activity,
    Loader2,
    Server,
    Globe,
    Database,
    BookOpen,
} from "lucide-react";

interface ServerConnectionScreenProps {
    status: "connecting" | "connected" | "disconnected";
    onOpenCatalog?: () => void;
    onOpenDocs?: () => void;
}

const DOCKER_COMMANDS = `mkdir -p gridap-lab && cd gridap-lab
mkdir -p data/sims data/models plots
curl -fsSLO https://raw.githubusercontent.com/bitsarebits/Gridap-NeuralOperators-GSoC2026/main/docker-compose.release.yml
docker compose -f docker-compose.release.yml pull
LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" docker compose -f docker-compose.release.yml up -d`;

const SOURCE_COMMANDS = `git clone https://github.com/bitsarebits/Gridap-NeuralOperators-GSoC2026.git
cd Gridap-NeuralOperators-GSoC2026
julia --project=. -e 'using Pkg; Pkg.instantiate()'
julia --project=. scripts/server_dashboard.jl`;

export default function ServerConnectionScreen({
    status,
    onOpenCatalog,
    onOpenDocs,
}: ServerConnectionScreenProps) {
    const isGitHubPages = !window.location.hostname.endsWith("github.io");

    if (isGitHubPages && status !== "connected") {
        return (
            <div className="w-full max-w-2xl min-w-0 mx-auto flex flex-col items-center justify-center py-8 sm:py-16 px-2 sm:px-4 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-blue-50 p-3.5 sm:p-4 rounded-full text-blue-500 mb-4 sm:mb-6 border border-blue-100 shrink-0">
                    <Globe size={40} className="sm:w-12 sm:h-12" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3 px-2">
                    Read-Only Public Gallery
                </h2>
                <p className="text-xs sm:text-base text-slate-600 mb-6 px-2 leading-relaxed">
                    You are viewing the GridapROMs dashboard online. The local
                    Julia backend is not accessible, so you can explore cached
                    experiments and shared results in the Registry, or read the
                    architectural documentation.
                </p>

                {/* Pulsanti di navigazione rapida per chi arriva da GitHub Pages */}
                {(onOpenCatalog || onOpenDocs) && (
                    <div className="flex flex-wrap items-center justify-center gap-3 mb-8 w-full px-2">
                        {onOpenCatalog && (
                            <button
                                type="button"
                                onClick={onOpenCatalog}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-colors cursor-pointer"
                            >
                                <Database size={16} />
                                <span>Explore Experiment Registry</span>
                            </button>
                        )}
                        {onOpenDocs && (
                            <button
                                type="button"
                                onClick={onOpenDocs}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
                            >
                                <BookOpen size={16} />
                                <span>Read Documentation</span>
                            </button>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-4 w-full min-w-0">
                    {/* Recommended: Docker */}
                    <section className="bg-white border border-blue-200 rounded-xl p-4 sm:p-6 w-full min-w-0 overflow-hidden text-left shadow-sm">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="bg-blue-50 text-blue-600 p-2 rounded-lg shrink-0">
                                <Server size={20} />
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h3 className="font-semibold text-sm sm:text-base text-slate-800">
                                        Run with Docker
                                    </h3>
                                    <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                                        Recommended
                                    </span>
                                </div>

                                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                                    Start the pre-built application without
                                    installing Julia or Node.js. Requires Docker
                                    Engine or Docker Desktop with the Docker
                                    Compose plugin.
                                </p>
                            </div>
                        </div>

                        <p className="text-[11px] text-slate-400 mb-2">
                            Linux / macOS / WSL
                        </p>

                        <pre className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-[11px] sm:text-xs font-mono text-slate-700 w-full max-w-full overflow-x-auto select-all leading-relaxed whitespace-pre">
                            {DOCKER_COMMANDS}
                        </pre>

                        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                            Once the container is running, open{" "}
                            <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">
                                http://127.0.0.1:8080
                            </code>{" "}
                            in your browser.
                        </p>
                    </section>

                    {/* Alternative: run from source */}
                    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 w-full min-w-0 overflow-hidden text-left shadow-sm">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="bg-slate-100 text-slate-600 p-2 rounded-lg shrink-0">
                                <BookOpen size={20} />
                            </div>

                            <div className="min-w-0">
                                <h3 className="font-semibold text-sm sm:text-base text-slate-800 mb-1">
                                    Run from source
                                </h3>

                                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                                    Alternatively, clone the repository and run
                                    the Julia backend directly. Requires a local
                                    Julia installation.
                                </p>
                            </div>
                        </div>

                        <pre className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-[11px] sm:text-xs font-mono text-slate-700 w-full max-w-full overflow-x-auto select-all leading-relaxed whitespace-pre">
                            {SOURCE_COMMANDS}
                        </pre>
                    </section>
                </div>
            </div>
        );
    }

    const isConnecting = status === "connecting";

    return (
        <div className="py-12 sm:py-20 w-full min-w-0 flex flex-col items-center justify-center px-2 sm:px-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-6 sm:p-10 max-w-md w-full min-w-0 text-center flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="relative mb-6">
                    <BrainCircuit
                        size={64}
                        className="text-blue-600 opacity-20"
                    />
                    <Activity
                        size={32}
                        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isConnecting ? "text-blue-600 animate-pulse" : "text-red-500"}`}
                    />
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
                    {isConnecting ? "Booting Engine..." : "Connection Lost"}
                </h2>

                <p className="text-slate-500 text-xs sm:text-sm mb-6 sm:mb-8 leading-relaxed">
                    {isConnecting
                        ? "Waking up the Julia backend and JIT compiling libraries. This can take a few minutes on the first run."
                        : "Cannot reach the Julia server. Please ensure Oxygen.jl is running on port 8080."}
                </p>

                <div className="flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold bg-slate-50 px-4 sm:px-6 py-3 rounded-xl border border-slate-100 w-full">
                    {isConnecting ? (
                        <>
                            <Loader2
                                size={16}
                                className="text-blue-500 animate-spin shrink-0"
                            />
                            <span className="text-blue-700 truncate">
                                Waiting for Julia Backend...
                            </span>
                        </>
                    ) : (
                        <>
                            <Server
                                size={16}
                                className="text-red-500 shrink-0"
                            />
                            <span className="text-red-700">Server Offline</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
