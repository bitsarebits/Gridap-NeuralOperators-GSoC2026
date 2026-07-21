import { useState } from "react";
import {
    Loader2,
    AlertCircle,
    Hash,
    RefreshCw,
    Database,
    Filter,
    ChevronUp,
    ChevronDown,
} from "lucide-react";
import DatasetNode from "../components/registry/DatasetNode";
import FilterPanel from "../components/registry/FilterPanel";
import { useMergedRegistry } from "../hooks/useMergedRegistry";
import { useRegistryFilter } from "../hooks/useRegistryFilter";

interface RegistryCatalogProps {
    serverIsConnected: boolean;
    onFineTune: (
        modelHash: string,
        modelType: string,
        solverConfig: any,
        femConfig: any,
    ) => void;
}

export default function RegistryCatalog({
    serverIsConnected,
    onFineTune,
}: RegistryCatalogProps) {
    const {
        data: rawRegistry,
        isLoading,
        error,
        refetch,
        isRefetching,
    } = useMergedRegistry();

    const { filters, updateFilter, clearFilters, filteredRegistry } =
        useRegistryFilter(rawRegistry);
    const [showFilters, setShowFilters] = useState(false);

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

    const hasData =
        filteredRegistry && Object.keys(filteredRegistry.data).length > 0;
    const activeFilterCount = Object.keys(filters).length;

    return (
        <div className="flex flex-col gap-6 w-full max-w-5xl animate-in fade-in duration-300">
            {/* Catalog Header Card */}
            <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 flex justify-between items-center bg-white">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Database className="text-blue-600" size={24} />
                            Simulation Registry Catalog
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            Cached high-fidelity FEM snapshots, neural operators
                            weights, and zero-shot evaluations.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors flex items-center gap-2 ${
                                activeFilterCount > 0
                                    ? "bg-blue-50 border-blue-200 text-blue-700"
                                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            <Filter size={16} />
                            Filters{" "}
                            {activeFilterCount > 0 && `(${activeFilterCount})`}
                            {showFilters ? (
                                <ChevronUp size={16} />
                            ) : (
                                <ChevronDown size={16} />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isRefetching}
                            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50"
                        >
                            <RefreshCw
                                size={16}
                                className={isRefetching ? "animate-spin" : ""}
                            />
                            {isRefetching ? "Syncing..." : "Refresh"}
                        </button>
                    </div>
                </div>

                {/* Il FilterPanel è ora un blocco nel normale document flow */}
                {showFilters && (
                    <FilterPanel
                        filters={filters}
                        updateFilter={updateFilter}
                        clearFilters={clearFilters}
                    />
                )}
            </div>

            {!hasData && (
                <div className="text-center bg-white border border-dashed border-slate-200 rounded-2xl p-16 flex flex-col items-center">
                    <Hash size={48} className="text-slate-300 mb-3" />
                    <p className="text-slate-600 font-semibold text-lg">
                        {activeFilterCount > 0
                            ? "No simulations match your exact parameters."
                            : "No simulations found."}
                    </p>
                </div>
            )}

            {filteredRegistry &&
                Object.keys(filteredRegistry.data).map((dataHash) => (
                    <DatasetNode
                        key={dataHash}
                        dataHash={dataHash}
                        femConfig={filteredRegistry.data[dataHash]}
                        registry={filteredRegistry}
                        serverIsConnected={serverIsConnected}
                        onFineTune={onFineTune}
                    />
                ))}
        </div>
    );
}
