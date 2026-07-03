import { useState } from "react";
import type { SimulationResponse } from "../types";
import DeleteButton from "./ui/DeleteButton";
import DownloadButton from "./ui/DownloadButton";
import ShareButton from "./ui/ShareButton";
import { Trash2, ChevronDown } from "lucide-react";

interface ResultsProps {
    result: SimulationResponse;
    onReset: () => void;
}

export default function Results({ result, onReset }: ResultsProps) {
    const [showDiscardMenu, setShowDiscardMenu] = useState(false);

    const plotHash = result.eval_hash || "";
    const modelHash = result.model_hash || "";
    const dataHash = result.data_hash || "";
    const imageUrl = result.image_url || "";

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Evaluation Results
            </h2>
            <p className="text-slate-500 mb-6">
                Zero-shot prediction vs High-Fidelity FEM data.
            </p>

            <div className="border rounded-xl overflow-hidden bg-slate-50 flex justify-center p-4">
                <img
                    src={imageUrl}
                    alt={`Plot for hash ${plotHash}`}
                    className="max-w-full h-auto rounded-lg shadow-sm"
                    onError={() =>
                        console.error("Failed to render the Base64 image data.")
                    }
                />
            </div>

            <div className="mt-6 flex justify-between items-center text-sm text-slate-500">
                <p>
                    Hash reference:{" "}
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                        {plotHash}
                    </span>
                </p>

                {/* action buttons */}
                <div className="flex items-center gap-3">
                    {/* Discard Options Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDiscardMenu(!showDiscardMenu)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-100 rounded-lg transition-all"
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

                        {/* Dropdown Menu */}
                        {showDiscardMenu && (
                            <div className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-slate-200 shadow-xl rounded-xl p-2 flex flex-col gap-1 z-10 animate-in fade-in slide-in-from-bottom-2">
                                <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 border-b border-slate-100 mb-1">
                                    What do you want to delete?
                                </div>

                                {/* Plot only */}
                                <DeleteButton
                                    targetHash={plotHash}
                                    targetType="evaluation"
                                    mode="local"
                                    buttonLabel="Discard Plot Only"
                                    onSuccess={onReset}
                                />

                                {/* model and plots */}
                                <DeleteButton
                                    targetHash={modelHash}
                                    targetType="model"
                                    mode="local"
                                    buttonLabel="Discard Model & Plot"
                                    onSuccess={onReset}
                                />

                                {/* Data model and plot */}
                                <DeleteButton
                                    targetHash={dataHash}
                                    targetType="data"
                                    mode="local"
                                    buttonLabel="Discard Entire Pipeline (Data+Model+Plot)"
                                    onSuccess={onReset}
                                />
                            </div>
                        )}
                    </div>

                    <ShareButton evalHash={plotHash} />

                    <DownloadButton
                        imageUrl={imageUrl}
                        fileName={`evaluation_${plotHash}.png`}
                    />
                </div>
            </div>
        </div>
    );
}
