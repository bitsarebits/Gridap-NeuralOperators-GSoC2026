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
import { fetchEvaluationJson } from "../../api";
import ShareButton from "../ui/ShareButton";
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

    // Local and shared entries follow the same canonical registry schema.
    const syncPayload =
        femConfig && modelConfig
            ? {
                  eval_hash: evalHash,
                  model_type: modelConfig.solver_type,
                  hashes: {
                      data_hash: dataHash,
                      model_hash: modelHash,
                  },
                  fem_config: femConfig,
                  solver_config: modelConfig.solver,
                  eval_config: evalObj.eval_config,
                  benchmark_version: evalObj.benchmark_version,
                  data_url: femConfig.data_url || "",
                  model_url: modelConfig.model_url || "",
                  eval_url: evalObj.eval_url,
              }
            : null;

    const toggleExpansion = async () => {
        const willExpand = !isExpanded;
        setIsExpanded(willExpand);

        if (willExpand && !evalData) {
            setIsLoading(true);
            setError(null);
            try {
                const data = await fetchEvaluationJson(evalHash, solverType, {
                    isLocal,
                    isShared,
                    serverIsConnected,
                    evalUrl: evalObj.eval_url,
                });
                setEvalData(data);
            } catch (err) {
                console.error("Failed to load evaluation:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to fetch evaluation JSON.",
                );
            } finally {
                setIsLoading(false);
            }
        }
    };

    const sigmaTest = evalObj.eval_config.sigma_test;

    const numericSigma = Number(sigmaTest);
    const hasInteractiveArtifact =
        evalObj.benchmark_version === 2 &&
        (isLocal || (isShared && Boolean(evalObj.eval_url)));

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
                className="p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50/60 select-none"
            >
                <div className="flex items-center flex-wrap gap-1.5 sm:gap-2.5 pl-1 sm:pl-4 min-w-0">
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
                                    solverType: modelConfig.solver_type,
                                    sigmaTest,
                                    evalUrl: evalObj.eval_url,
                                    isLocal,
                                    isShared,
                                    serverIsConnected,
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

                    <LineChart size={14} className="text-amber-600 shrink-0" />
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
                    {!isLocal && !isShared && (
                        <span className="text-[9px] uppercase font-bold tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
                            Not on disk
                        </span>
                    )}
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1 py-0.5 rounded select-all">
                        {evalHash}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                    <span className="text-[10px] mr-2 hidden sm:inline">
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
                <div className="border-t border-slate-100 bg-slate-50/50 p-2 sm:p-4 flex flex-col items-center gap-3 animate-in fade-in duration-200">
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
                            <div className="w-full min-w-0">
                                <InteractiveEvaluationView
                                    evalData={evalData}
                                    compact={true}
                                />
                            </div>
                            <div className="w-full flex flex-col sm:flex-row sm:flex-wrap justify-end items-stretch sm:items-center gap-2 mt-2">
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
                    ) : (
                        <div className="text-xs text-red-500 font-medium py-4 flex items-center gap-1">
                            <AlertCircle size={14} className="shrink-0" />{" "}
                            <span>
                                {error ||
                                    `The evaluation file for '${evalHash}' was not found.`}
                            </span>
                            {isShared && !isLocal && serverIsConnected && syncPayload && (
                                <div className="ml-auto">
                                    <SyncWorkspaceButton
                                        isLocal={false}
                                        syncPayload={syncPayload}
                                        buttonLabel="Sync Evaluation to Workspace"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
