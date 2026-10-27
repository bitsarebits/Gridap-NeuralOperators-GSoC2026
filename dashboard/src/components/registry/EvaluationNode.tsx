import { useState } from "react";
import {
    LineChart,
    ChevronDown,
    ChevronRight,
    Loader2,
    AlertCircle,
    Cloud,
    HardDrive,
    Trophy,
} from "lucide-react";
import { fetchCloudEvaluationJson, fetchEvaluationPlot } from "../../api";
import ShareButton from "../ui/ShareButton";
import DownloadButton from "../ui/DownloadButton";
import SyncWorkspaceButton from "../ui/SyncWorkspaceButton";
import InteractiveEvaluationView from "../InteractiveEvaluationView";
import type {
    ArenaCandidate,
    InteractiveEvalData,
    RegistryData,
} from "../../types";
import DeleteButton from "../ui/DeleteButton";

interface Props {
    evalHash: string;
    evalObj: any;
    solverType: string;
    serverIsConnected: boolean;
    registry: RegistryData;
    isSelectedForArena?: boolean;
    referenceArenaCandidate?: ArenaCandidate | null;
    onToggleArena?: (candidate: ArenaCandidate) => void;
}

export default function EvaluationNode({
    evalHash,
    evalObj,
    solverType,
    serverIsConnected,
    registry,
    isSelectedForArena = false,
    onToggleArena,
    referenceArenaCandidate,
}: Props) {
    // State
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [plotImage, setPlotImage] = useState<string | null>(
        evalObj.image_url || null,
    ); // Initialized if it came from firebase
    const [evalData, setEvalData] = useState<InteractiveEvalData | null>(null);
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
        femConfig && modelConfig
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
                  data_url: femConfig.data_url || "",
                  model_url: modelConfig.model_url || "",
                  image_url: evalObj.image_url || "",
                  eval_url: evalObj.eval_url || "",
              }
            : null;

    const toggleExpansion = async () => {
        const willExpand = !isExpanded;
        setIsExpanded(willExpand);

        if (willExpand && !evalData && !plotImage) {
            setIsLoading(true);
            setError(null);
            try {
                if (isLocal && serverIsConnected) {
                    const res = await fetchEvaluationPlot(evalHash, solverType);
                    if (res.status === "success") {
                        if (res.eval_data) setEvalData(res.eval_data);
                        else if (res.image_url) setPlotImage(res.image_url);
                    } else {
                        setError(
                            res.message ||
                                "Evaluation not found on local disk.",
                        );
                    }
                } else if (evalObj.eval_url) {
                    const cloudData = await fetchCloudEvaluationJson(
                        evalObj.eval_url,
                    );
                    setEvalData(cloudData);
                }
            } catch (err) {
                console.error("Failed to load evaluation:", err);
                setError("Failed to fetch evaluation data.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    const evalConfig = evalObj.eval_config || evalObj;
    const sigmaTest = evalConfig.sigma_test || "N/A";

    const numericSigma = Number(sigmaTest);
    const hasInteractiveArtifact = isLocal
        ? (evalObj.benchmark_version ?? 2) === 2
        : Boolean(evalObj.eval_url);

    const isArenaCompatible =
        hasInteractiveArtifact &&
        Boolean(dataHash) &&
        Number.isFinite(numericSigma) &&
        (!referenceArenaCandidate ||
            (referenceArenaCandidate.dataHash === dataHash &&
                Math.abs(
                    Number(referenceArenaCandidate.sigmaTest) - numericSigma,
                ) <= 1e-12));

    const showArenaButton =
        Boolean(onToggleArena) && (isSelectedForArena || isArenaCompatible);

    return (
        <div className="border border-slate-100 bg-white rounded-lg overflow-hidden shadow-2xs">
            <div
                onClick={toggleExpansion}
                className="p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50/60 select-none"
            >
                <div className="flex items-center gap-2.5 pl-4">
                    {/* Arena Selection Checkbox */}
                    {showArenaButton && onToggleArena && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleArena({
                                    evalHash,
                                    modelHash,
                                    dataHash: dataHash || "",
                                    solverType: parsedModelType,
                                    sigmaTest,
                                    evalUrl: evalObj.eval_url,
                                    isLocal,
                                });
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                                isSelectedForArena
                                    ? "bg-amber-100 border-amber-300 text-amber-900"
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:border-amber-300"
                            }`}
                            title="Select to compare in Arena Mode"
                        >
                            <Trophy size={11} />
                            {isSelectedForArena ? "In Arena" : "Arena"}
                        </button>
                    )}

                    <LineChart size={14} className="text-amber-600" />
                    <span className="font-semibold text-slate-700">
                        Zero-Shot Report (σ_test: {sigmaTest})
                    </span>
                    {isShared && (
                        <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100">
                            <Cloud size={10} /> Cloud
                        </span>
                    )}
                    {isLocal && (
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
                        Click to inspect evaluation
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
                            Loading spatio-temporal evaluation tensors...
                        </div>
                    ) : evalData ? (
                        <>
                            <div className="w-full">
                                <InteractiveEvaluationView
                                    evalData={evalData}
                                    compact={true}
                                />
                            </div>
                            <div className="w-full flex justify-end items-center gap-2 mt-2">
                                {isShared && serverIsConnected && (
                                    <DeleteButton
                                        targetHash={evalHash}
                                        targetType="evaluation"
                                        mode="cloud"
                                        buttonLabel="Remove from Cloud"
                                        parentModelHash={modelHash}
                                        parentDataHash={dataHash}
                                    />
                                )}
                                {isLocal && (
                                    <DeleteButton
                                        targetHash={evalHash}
                                        targetType="evaluation"
                                        mode="local"
                                        buttonLabel="Delete Local File"
                                    />
                                )}
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
                            </div>
                        </>
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
                                {isShared && serverIsConnected && (
                                    <DeleteButton
                                        targetHash={evalHash}
                                        targetType="evaluation"
                                        mode="cloud"
                                        buttonLabel="Remove from Cloud"
                                        parentModelHash={modelHash}
                                        parentDataHash={dataHash}
                                    />
                                )}

                                {/* Delete Local */}
                                {isLocal && (
                                    <DeleteButton
                                        targetHash={evalHash}
                                        targetType="evaluation"
                                        mode="local"
                                        buttonLabel="Delete Local File"
                                    />
                                )}
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
                                `The evaluation file for '${evalHash}' was not found.`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
