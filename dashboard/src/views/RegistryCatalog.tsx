// dashboard/src/views/RegistryCatalog.tsx

import { useState, useEffect } from "react";
import { Database, RefreshCw, Loader2, AlertCircle, Hash } from "lucide-react";
import { fetchRegistry } from "../api";
import type { RegistryData } from "../types";
import DatasetNode from "../components/registry/DatasetNode";

export default function RegistryCatalog() {
    const [registry, setRegistry] = useState<RegistryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadRegistryData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchRegistry();
            if (res.status === "success" && res.data) {
                setRegistry(res.data);
            } else {
                setError(res.message || "Failed to parse registry data.");
            }
        } catch (err: any) {
            setError(
                err.response?.data?.message ||
                    "Cannot connect to the Julia API server.",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRegistryData();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4 w-full max-w-5xl">
                <Loader2 size={40} className="animate-spin text-slate-600" />
                <p className="text-slate-500 font-medium">
                    Syncing with Julia Hash Registry...
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl flex flex-col gap-6 animate-in fade-in duration-300">
            {/* Catalog Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Database className="text-blue-600" size={24} />
                        Simulation Registry Catalog
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Explore cached high-fidelity FEM snapshots, neural
                        operators weights, and zero-shot evaluations.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={loadRegistryData}
                    className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer flex items-center gap-2 text-sm font-semibold shadow-sm"
                >
                    <RefreshCw size={16} /> Refresh Catalog
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-center gap-3 rounded-r-xl">
                    <AlertCircle className="text-red-500 shrink-0" />
                    <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
            )}

            {registry && Object.keys(registry.data).length === 0 && (
                <div className="text-center bg-white border border-dashed border-slate-200 rounded-2xl p-16 flex flex-col items-center">
                    <Hash size={48} className="text-slate-300 mb-3" />
                    <p className="text-slate-600 font-semibold text-lg">
                        No simulations found
                    </p>
                    <p className="text-slate-400 text-sm max-w-sm mt-1">
                        The registry.json is empty. Go back to the Pipeline
                        Orchestrator tab to launch your first training.
                    </p>
                </div>
            )}

            {/* Render the Tree via Components */}
            {registry &&
                Object.keys(registry.data).map((dataHash) => (
                    <DatasetNode
                        key={dataHash}
                        dataHash={dataHash}
                        femConfig={registry.data[dataHash]}
                        registry={registry}
                    />
                ))}
        </div>
    );
}
