import { useState } from "react";
import type { SimulationResponse } from "../types";
import DeleteButton from "./ui/DeleteButton";
import ShareButton from "./ui/ShareButton";
import InteractiveEvaluationView from "./InteractiveEvaluationView";
import { Trash2, ChevronDown } from "lucide-react";

interface ResultsProps {
    result: SimulationResponse;
    onReset: () => void;
}

export default function Results({ result, onReset }: ResultsProps) {
    const [showDiscardMenu, setShowDiscardMenu] = useState(false);

    const plotHash = result.eval_hash;
    const modelHash = result.model_hash;
    const dataHash = result.data_hash;
    const evalData = result.eval_data;

    return (
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 w-full max-w-5xl mt-4 sm:mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-1">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
                    Interactive Zero-Shot Evaluation
                </h2>
                {evalData?.solver_name && (
                    <span className="px-3 py-1 text-xs font-bold tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                        {evalData.solver_name}
                    </span>
                )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mb-5 sm:mb-6">
                Explore the full spatio-temporal solution, pointwise error
                evolution, and benchmark metrics.
            </p>

            <InteractiveEvaluationView evalData={evalData} />

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 text-xs sm:text-sm text-slate-500">
                <p>
                    Hash reference:{" "}
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700 select-all">
                        {plotHash}
                    </span>
                </p>

                {/* action buttons */}
                <div className="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
                    {/* Discard Options Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDiscardMenu(!showDiscardMenu)}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-100 rounded-lg transition-all"
                        >
                            <Trash2 size={14} /> Discard...{" "}
                            <ChevronDown
                                size={14}
                                className={
                                    showDiscardMenu
                                        ? "rotate-180 transition-transform"
                                        : "transition-transform"
                                }
                            />
                        </button>

                        {/* Dropdown Menu - Safe alignment on both mobile and desktop */}
                        {showDiscardMenu && (
                            <div className="absolute bottom-full left-0 sm:left-auto sm:right-0 mb-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 shadow-xl rounded-xl p-2 flex flex-col gap-1 z-20 animate-in fade-in slide-in-from-bottom-2">
                                <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 border-b border-slate-100 mb-1">
                                    What do you want to delete?
                                </div>

                                {/* Plot only */}
                                <DeleteButton
                                    targetHash={plotHash}
                                    targetType="evaluation"
                                    mode="local"
                                    buttonLabel="Discard Evaluation Only"
                                    onSuccess={onReset}
                                />

                                {/* model and plots */}
                                <DeleteButton
                                    targetHash={modelHash}
                                    targetType="model"
                                    mode="local"
                                    buttonLabel="Discard Model & Evaluation"
                                    onSuccess={onReset}
                                />

                                {/* Data model and plot */}
                                <DeleteButton
                                    targetHash={dataHash}
                                    targetType="data"
                                    mode="local"
                                    buttonLabel="Discard Entire Pipeline (Data+Model+Eval)"
                                    onSuccess={onReset}
                                />
                            </div>
                        )}
                    </div>

                    <ShareButton evalHash={plotHash} />
                </div>
            </div>
        </div>
    );
}
