import { BrainCircuit, Activity, Loader2, Server } from "lucide-react";

interface ServerConnectionScreenProps {
    status: "connecting" | "connected" | "disconnected";
}

export default function ServerConnectionScreen({
    status,
}: ServerConnectionScreenProps) {
    if (status === "connected") return null;

    const isConnecting = status === "connecting";

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
                        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isConnecting ? "text-blue-600 animate-pulse" : "text-red-500"}`}
                    />
                </div>

                <h2 className="text-2xl font-bold text-slate-800 mb-2">
                    {isConnecting ? "Booting Engine..." : "Connection Lost"}
                </h2>

                <p className="text-slate-500 text-sm mb-8">
                    {isConnecting
                        ? "Waking up the Julia backend and JIT compiling libraries. This can take a few minutes on the first run."
                        : "Cannot reach the Julia server. Please ensure Oxygen.jl is running on port 8080."}
                </p>

                <div className="flex items-center justify-center gap-3 text-sm font-semibold bg-slate-50 px-6 py-3 rounded-xl border border-slate-100 w-full">
                    {isConnecting ? (
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
                            <span className="text-red-700">Server Offline</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
