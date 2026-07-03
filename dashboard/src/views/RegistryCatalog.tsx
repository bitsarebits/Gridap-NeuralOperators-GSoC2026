import { Loader2, AlertCircle, Hash, RefreshCw, Database } from "lucide-react";
import DatasetNode from "../components/registry/DatasetNode";
import { useMergedRegistry } from "../hooks/useMergedRegistry";

interface RegistryCatalogProps {
    serverIsConnected: boolean;
}

export default function RegistryCatalog({
    serverIsConnected,
}: RegistryCatalogProps) {
    const {
        data: registry,
        isLoading,
        error,
        refetch,
        isRefetching,
    } = useMergedRegistry();

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4 w-full max-w-5xl">
                <Loader2 size={40} className="animate-spin text-slate-600" />
                <p className="text-slate-500 font-medium">
                    Syncing local cache and cloud gallery...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-center gap-3 rounded-xl">
                <AlertCircle className="text-red-500 shrink-0" />
                <p className="text-red-700 text-sm font-medium">
                    Failed to sync registry.
                </p>
            </div>
        );
    }

    const hasData = registry && Object.keys(registry.data).length > 0;

    return (
        <div className="flex flex-col gap-6 w-full max-w-5xl animate-in fade-in duration-300">
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
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer flex items-center gap-2 text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {/* Facciamo girare l'icona quando sta caricando in background */}
                    <RefreshCw
                        size={16}
                        className={isRefetching ? "animate-spin" : ""}
                    />
                    {isRefetching ? "Syncing..." : "Refresh Catalog"}
                </button>
            </div>

            {!hasData && (
                <div className="text-center bg-white border border-dashed border-slate-200 rounded-2xl p-16 flex flex-col items-center">
                    <Hash size={48} className="text-slate-300 mb-3" />
                    <p className="text-slate-600 font-semibold text-lg">
                        No simulations found
                    </p>
                </div>
            )}

            {registry &&
                Object.keys(registry.data).map((dataHash) => (
                    <DatasetNode
                        key={dataHash}
                        dataHash={dataHash}
                        femConfig={registry.data[dataHash]}
                        registry={registry}
                        serverIsConnected={serverIsConnected}
                    />
                ))}
        </div>
    );
}
