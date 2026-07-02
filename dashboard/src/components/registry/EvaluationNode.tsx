import { useState } from "react";
import {
    LineChart,
    ChevronDown,
    ChevronRight,
    Loader2,
    AlertCircle,
    Download,
} from "lucide-react";
import { fetchEvaluationPlot } from "../../api";
import ShareButton from "../ui/ShareButton";

interface Props {
    evalHash: string;
    evalObj: any;
    solverType: string;
}

export default function EvaluationNode({
    evalHash,
    evalObj,
    solverType,
}: Props) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [plotImage, setPlotImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const toggleExpansion = async () => {
        const willExpand = !isExpanded;
        setIsExpanded(willExpand);

        if (willExpand && !plotImage) {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetchEvaluationPlot(evalHash, solverType);
                if (res.status === "success" && res.image_url) {
                    setPlotImage(res.image_url);
                } else {
                    setError(res.message || "Image not found.");
                }
            } catch (err) {
                console.error("Failed to load archived plot:", err);
                setError("Failed to fetch plot from server.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    const evalConfig = evalObj.eval_config || evalObj;
    const sigmaTest = evalConfig.sigma_test || "N/A";

    return (
        <div className="border border-slate-100 bg-white rounded-lg overflow-hidden shadow-2xs">
            <div
                onClick={toggleExpansion}
                className="p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50/60 select-none"
            >
                <div className="flex items-center gap-2.5 pl-4">
                    <LineChart size={14} className="text-amber-600" />
                    <span className="font-semibold text-slate-700">
                        Zero-Shot Report (σ_test: {sigmaTest})
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1 py-0.5 rounded select-all">
                        {evalHash}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                    <span className="text-[10px] mr-2">
                        Click to inspect plot
                    </span>
                    {isExpanded ? (
                        <ChevronDown size={14} />
                    ) : (
                        <ChevronRight size={14} />
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex flex-col items-center gap-3 animate-in fade-in duration-200">
                    {isLoading ? (
                        <div className="flex items-center gap-2 py-6 text-xs font-medium text-slate-500">
                            <Loader2
                                size={14}
                                className="animate-spin text-blue-500"
                            />
                            Reading CairoMakie matrix binary from disk...
                        </div>
                    ) : plotImage ? (
                        <>
                            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white p-2 w-full max-w-3xl">
                                <img
                                    src={plotImage}
                                    alt={`Plot report ${evalHash}`}
                                    className="w-full h-auto rounded-lg"
                                />
                            </div>
                            {/* action buttons */}
                            <div className="w-full max-w-3xl flex justify-end items-center gap-2 mt-3">
                                <ShareButton evalHash={evalHash} />

                                <a
                                    href={plotImage}
                                    download={`archived_eval_${evalHash}.png`}
                                    className="text-[11px] font-bold bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer h-8.5"
                                >
                                    <Download size={12} /> Download Chart
                                </a>
                            </div>
                        </>
                    ) : (
                        <div className="text-xs text-red-500 font-medium py-4 flex items-center gap-1">
                            <AlertCircle size={14} />{" "}
                            {error ||
                                `The plot file 'eval_${evalHash}.png' was not found.`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
