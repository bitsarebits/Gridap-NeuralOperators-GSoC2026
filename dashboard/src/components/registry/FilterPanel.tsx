import type { RegistryFilters } from "../../hooks/useRegistryFilter";
import { X } from "lucide-react";

interface FilterPanelProps {
    filters: RegistryFilters;
    updateFilter: (key: string, value: any) => void;
    clearFilters: () => void;
}

// Reusable micro-component for filter inputs
const FilterInput = ({
    label,
    field,
    type = "number",
    step = "any",
    filters,
    updateFilter,
}: {
    label: string;
    field: string;
    type?: string;
    step?: string;
    filters: any;
    updateFilter: any;
}) => (
    <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
            {label}
        </label>
        <input
            type={type}
            step={step}
            value={filters[field] ?? ""}
            placeholder={type === "text" ? "e.g. 64, 64" : ""}
            onChange={(e) => {
                if (type === "number") {
                    const val = parseFloat(e.target.value);
                    updateFilter(field, Number.isNaN(val) ? "" : val);
                } else {
                    updateFilter(field, e.target.value);
                }
            }}
            className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        />
    </div>
);

export default function FilterPanel({
    filters,
    updateFilter,
    clearFilters,
}: FilterPanelProps) {
    const activeFilterCount = Object.keys(filters).length;
    const selectedModel = filters.model_type;

    return (
        <div className="w-full p-6 bg-white border-t border-slate-100 shadow-md animate-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-700">
                    Parametric Search Space
                </h3>
                {activeFilterCount > 0 && (
                    <button
                        onClick={clearFilters}
                        className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                        <X size={14} /> Clear All
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* FEM Category */}
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-emerald-600 border-b border-emerald-100 pb-1">
                        FEM Domain
                    </h4>
                    <FilterInput
                        label="Spatial Partitions (nx)"
                        field="nx"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Domain Half-Length (L)"
                        field="L"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Order (p)"
                        field="order"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Advection Velocity (c)"
                        field="c"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                </div>

                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-emerald-600 border-b border-emerald-100 pb-1">
                        Time & Scope
                    </h4>
                    <FilterInput
                        label="Time Step (dt)"
                        field="dt"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Final Time (tf)"
                        field="tf"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Beta Start (β)"
                        field="beta_start"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Eval Sigma Test"
                        field="sigma_test"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                </div>

                {/* Architecture Category */}
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-indigo-600 border-b border-indigo-100 pb-1">
                        Training & Model
                    </h4>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                            Architecture
                        </label>
                        <select
                            value={filters.model_type || ""}
                            onChange={(e) =>
                                updateFilter("model_type", e.target.value)
                            }
                            className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">Any</option>
                            <option value="DeepONet">DeepONet</option>
                            <option value="FNO">FNO</option>
                            <option value="NOMAD">NOMAD</option>
                        </select>
                    </div>
                    <FilterInput
                        label="Epochs"
                        field="epochs"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                    <FilterInput
                        label="Batch Size"
                        field="batch_size"
                        filters={filters}
                        updateFilter={updateFilter}
                    />
                </div>

                {/* Dynamic Grid Specs Category */}
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-indigo-600 border-b border-indigo-100 pb-1">
                        Architecture Specs
                    </h4>
                    {!selectedModel ? (
                        <p className="text-xs text-slate-400 italic mt-2 leading-relaxed">
                            Select an architecture to filter by specific
                            hyperparameters.
                        </p>
                    ) : selectedModel === "DeepONet" ||
                      selectedModel === "NOMAD" ? (
                        <div className="animate-in fade-in duration-300 space-y-3">
                            <FilterInput
                                label="Sensors (m)"
                                field="m_sensors"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Latent Space (p)"
                                field="p_latent"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Hidden Neurons"
                                field="hidden"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Spatial Reduction (step_x)"
                                field="step_x"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Time Reduction (step_t)"
                                field="step_t"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                        </div>
                    ) : selectedModel === "FNO" ? (
                        <div className="animate-in fade-in duration-300 space-y-3">
                            <FilterInput
                                label="Modes"
                                field="modes"
                                type="text"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Hidden Channels"
                                field="hidden_channels"
                                type="text"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Reduced Spatial Grid (nx_red)"
                                field="nx_red"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                            <FilterInput
                                label="Reduced Temporal Grid (nt_red)"
                                field="nt_red"
                                filters={filters}
                                updateFilter={updateFilter}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
