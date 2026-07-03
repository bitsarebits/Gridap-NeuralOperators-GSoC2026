import { useState } from "react";
import {
    LineChart,
    ChevronDown,
    ChevronRight,
    Loader2,
    AlertCircle,
    Cloud,
    HardDrive,
} from "lucide-react";
import { fetchEvaluationPlot } from "../../api";
import ShareButton from "../ui/ShareButton";
import DownloadButton from "../ui/DownloadButton";
import SyncWorkspaceButton from "../ui/SyncWorkspaceButton";
import type { RegistryData } from "../../types";

interface Props {
    evalHash: string;
    evalObj: any;
    solverType: string;
    serverIsConnected: boolean;
    registry: RegistryData;
}

export default function EvaluationNode({
    evalHash,
    evalObj,
    solverType,
    serverIsConnected,
    registry,
}: Props) {
    // State
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [plotImage, setPlotImage] = useState<string | null>(
        evalObj.image_url || null,
    ); // Initialized if it came from firebase
    const [error, setError] = useState<string | null>(null);

    // Metadata flags for UI
    const isShared = !!evalObj._isShared;
    const isLocal = !!evalObj._isLocal;

    // Dependency tree for the Sync Payload
    const modelHash = evalObj.model_hash;
    const modelConfig = registry.models[modelHash];
    const dataHash = modelConfig?.data_hash;
    const femConfig = dataHash ? registry.data[dataHash] : null;

    // Backward Compatibility Parsers for legacy registry schemas
    const parsedSolverConfig = modelConfig?.solver || modelConfig;
    const parsedEvalConfig = evalObj?.eval_config || evalObj;
    const parsedModelType =
        modelConfig?.solver_type || modelConfig?.model_type || solverType;

    // Sync payload only if we have all the data in Firebase
    const syncPayload =
        femConfig &&
        modelConfig &&
        evalObj.image_url &&
        femConfig.data_url &&
        modelConfig.model_url
            ? {
                  eval_hash: evalHash,
                  model_type: parsedModelType,
                  hashes: {
                      data_hash: dataHash,
                      model_hash: modelHash,
                      eval_hash: evalHash,
                  },
                  fem_config: femConfig,
                  solver_config: parsedSolverConfig,
                  eval_config: parsedEvalConfig,
                  data_url: femConfig.data_url,
                  model_url: modelConfig.model_url,
                  image_url: evalObj.image_url,
              }
            : null;

    const toggleExpansion = async () => {
        const willExpand = !isExpanded;
        setIsExpanded(willExpand);

        if (willExpand && !plotImage && isLocal) {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetchEvaluationPlot(evalHash, solverType);
                if (res.status === "success" && res.image_url) {
                    setPlotImage(res.image_url);
                } else {
                    setError(res.message || "Image not found on local disk.");
                }
            } catch (err) {
                console.error("Failed to load local plot:", err);
                setError("Failed to fetch plot from local server.");
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
                    {isShared && (
                        <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100">
                            <Cloud size={10} /> Cloud
                        </span>
                    )}
                    {isLocal && !isShared && (
                        <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200">
                            <HardDrive size={10} /> Local
                        </span>
                    )}
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
                                {!isShared && (
                                    <ShareButton evalHash={evalHash} />
                                )}

                                {isShared &&
                                    !isLocal &&
                                    serverIsConnected &&
                                    syncPayload && (
                                        <SyncWorkspaceButton
                                            isLocal={isLocal}
                                            syncPayload={syncPayload}
                                        />
                                    )}

                                <DownloadButton
                                    imageUrl={plotImage}
                                    fileName={`archived_eval_${evalHash}.png`}
                                    text="Download Chart"
                                />
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
