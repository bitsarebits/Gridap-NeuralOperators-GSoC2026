import { useState } from "react";
import {
    AlertCircle,
    Brain,
    ChevronDown,
    ChevronRight,
    Cloud,
    DownloadCloud,
    GitFork,
    HardDrive,
    Loader2,
} from "lucide-react";
import ConfigGrid, { FORBIDDEN_KEYS } from "../ui/ConfigGrid";
import EvaluationNode from "./EvaluationNode";
import type { ArenaCandidate, RegistryData, SyncPayload } from "../../types";
import DeleteButton from "../ui/DeleteButton";
import { useQueryClient } from "@tanstack/react-query";
import { syncExperimentLocally } from "../../api";
import SyncWorkspaceButton from "../ui/SyncWorkspaceButton";

interface Props {
    modelHash: string;
    modelObj: any;
    femConfig: any;
    registry: RegistryData;
    serverIsConnected: boolean;
    onFineTune: (
        modelHash: string,
        modelType: string,
        solverConfig: any,
        femConfig: any,
    ) => void;
    selectedArenaHashes?: Set<string>;
    referenceArenaCandidate?: ArenaCandidate | null;
    onToggleArena?: (c: ArenaCandidate) => void;
}

// Normalize the current serialized Julia scheduler object for display.
const parseSchedulerConfig = (scheduler: any) => {
    if (!scheduler || typeof scheduler !== "object") {
        return {
            type: "Unknown" as const,
            scheduler_name: "Custom / Unknown",
        };
    }

    if (scheduler.type === "CosineAnnealing") {
        return {
            type: "Cosine" as const,
            lr_max: scheduler.lr_max,
            lr_min: scheduler.lr_min,
            max_epochs: scheduler.max_epochs,
        };
    }

    if (scheduler.type === "ReduceLROnPlateau") {
        return {
            type: "Plateau" as const,
            start_lr: scheduler.current_lr,
            min_lr: scheduler.min_lr,
            factor: scheduler.factor,
            patience: scheduler.patience,
        };
    }

    // Safe fallback
    return {
        type: "Unknown" as const,
        scheduler_name: String(scheduler.type || "Unknown"),
    };
};

const getSequence = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>);

        // Normalize JSON objects with numeric keys, e.g. {"1": 32}.
        if (entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key))) {
            return entries
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([, item]) => item);
        }
    }

    return null;
};

const formatFnoValues = (value: unknown, field: string): string => {
    const sequence = getSequence(value);

    if (sequence !== null) {
        return sequence.map(String).join(", ");
    }

    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }

    console.warn(`[Registry] Unexpected FNO "${field}" format:`, value);

    return value == null ? "" : (JSON.stringify(value) ?? String(value));
};

export default function ModelNode({
    modelHash,
    modelObj,
    femConfig,
    registry,
    serverIsConnected,
    onFineTune,
    selectedArenaHashes,
    onToggleArena,
    referenceArenaCandidate,
}: Props) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // Metadata flags
    const isShared = modelObj._isShared;
    const isLocal = modelObj._isLocal;
    const dependenciesAreLocal = isLocal && femConfig?._isLocal === true;

    // Filter evaluations linking to this model
    const linkedEvals = Object.entries(registry.evaluations).filter(
        ([_, e]) => e.model_hash === modelHash,
    );

    const solver = modelObj.solver;
    const solverType = modelObj.solver_type;
    const parsedScheduler = parseSchedulerConfig(solver.lr_scheduler);

    // Present the scheduler as a readable group instead of raw serialized fields.
    const sanitizedSolver = { ...solver };
    delete sanitizedSolver.lr_scheduler;

    const { type: schedulerKind, ...schedulerParams } = parsedScheduler;
    sanitizedSolver.Learning_Rate_Schedule = {
        ...schedulerParams,
        scheduler_name:
            schedulerKind === "Cosine"
                ? "Cosine Annealing"
                : "ReduceLROnPlateau",
    };

    const buildCompactModelString = () => {
        const parts: string[] = [];

        // Specific group for DeepONet
        if (solverType.includes("DeepONet") || solverType.includes("NOMAD")) {
            if (solver.p_latent !== undefined && solver.hidden !== undefined) {
                parts.push(`p=${solver.p_latent} • hidden=${solver.hidden}`);
            }
            if (solver.m_sensors !== undefined)
                parts.push(`m=${solver.m_sensors}`);
        }

        // Specific Group for FNO
        // FNO configuration
        if (solverType.includes("FNO")) {
            if (solver.modes !== undefined) {
                parts.push(`modes=[${formatFnoValues(solver.modes, "modes")}]`);
            }

            if (solver.hidden_channels !== undefined) {
                parts.push(
                    `channels=[${formatFnoValues(solver.hidden_channels, "hidden_channels")}]`,
                );
            }
        }

        // Shared parameters
        const epochs = solver.epochs;
        if (epochs !== undefined) parts.push(`epochs=${epochs}`);

        // Clean Scheduler Injection
        if (parsedScheduler && typeof parsedScheduler === "object") {
            if (parsedScheduler.type === "Cosine") {
                parts.push(
                    `LR: Cosine [${parsedScheduler.lr_max} ↘ ${parsedScheduler.lr_min}]`,
                );
            } else if (parsedScheduler.type === "Plateau") {
                parts.push(`LR: Plateau (pat=${parsedScheduler.patience})`);
            }
        }

        const groupedKeys = [
            "p_latent",
            "hidden",
            "m_sensors",
            "modes",
            "hidden_channels",
            "epochs",
            "lr_scheduler",
        ];

        Object.entries(solver).forEach(([k, v]) => {
            if (!FORBIDDEN_KEYS.includes(k) && !groupedKeys.includes(k)) {
                if (typeof v !== "object" || v === null) {
                    parts.push(`${k}=${v}`);
                }
            }
        });

        return parts.join(" | ");
    };

    const compactConfigString = buildCompactModelString();

    // Extract data info for the payload
    const dataHash = modelObj.data_hash;
    const dataObj = registry.data[dataHash] || {};

    // Build the shared partial SyncPayload
    const syncPayload: SyncPayload = {
        model_type: solverType,
        hashes: {
            data_hash: dataHash,
            model_hash: modelHash,
        },
        fem_config: femConfig,
        solver_config: solver,
        data_url: dataObj.data_url ?? undefined,
        model_url: modelObj.model_url ?? undefined,
    };

    // Unified handler for the Fine-Tune / Sync action
    const handleFineTuneAction = async () => {
        if (dependenciesAreLocal) {
            // Fast-path: both model weights and the source FEM dataset are on disk.
            onFineTune(modelHash, solverType, solver, femConfig);
            return;
        }

        // Needs to be pulled from remote first
        setIsSyncing(true);
        setSyncError(null);
        try {
            // Call the sync API with the shared payload
            const res = await syncExperimentLocally(syncPayload);

            if (res.status === "success") {
                // Invalidate query to update UI badges (Cloud -> Cloud + Local)
                queryClient.invalidateQueries({
                    queryKey: ["registry", "merged"],
                });

                // Immediately proceed to Orchestrator with the now-local data
                onFineTune(modelHash, solverType, solver, femConfig);
            }
        } catch (err: any) {
            setSyncError(
                err.response?.data?.message ||
                    "Failed to sync remote weights before fine-tuning.",
            );
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="bg-white border border-slate-100 rounded-xl overflow-hidden transition-all">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-3 sm:p-4 pl-3 sm:pl-12 flex items-start sm:items-center justify-between gap-2.5 sm:gap-4 cursor-pointer transition-colors select-none ${isExpanded ? "bg-slate-50/50" : "hover:bg-slate-50/30"}`}
            >
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                    <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100 text-indigo-600 shrink-0 mt-0.5 sm:mt-0">
                        <Brain size={18} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="font-bold text-sm sm:text-base text-slate-800">
                                {solverType} Weights
                            </span>
                            {isShared && (
                                <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                                    <Cloud size={12} /> Cloud
                                </span>
                            )}
                            {isLocal && (
                                <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">
                                    <HardDrive size={12} /> Local
                                </span>
                            )}
                            {!isLocal && !isShared && (
                                <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                                    Not on disk
                                </span>
                            )}

                            <span className="font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-semibold select-all">
                                {modelHash}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 font-mono leading-relaxed wrap-break-words">
                            {compactConfigString}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 mt-0.5 sm:mt-0">
                    <span className="text-[11px] sm:text-xs font-bold px-2 sm:px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                        {linkedEvals.length}{" "}
                        {linkedEvals.length === 1 ? "Plot" : "Plots"}
                    </span>
                    {isExpanded ? (
                        <ChevronDown size={16} className="text-slate-400" />
                    ) : (
                        <ChevronRight size={16} className="text-slate-400" />
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="bg-slate-50/20 p-1.5 sm:p-4 flex flex-col gap-3 animate-in slide-in-from-top-1 duration-150">
                    <ConfigGrid
                        title="Architecture & Training Configuration"
                        configObj={sanitizedSolver}
                    />

                    {/* ACTIONS ROW - Wrap buttons cleanly on narrow screens */}
                    <div className="flex flex-col sm:flex-row sm:flex-wrap justify-end items-stretch sm:items-start gap-2 my-1">
                        {/* Standard Sync Button */}
                        {isShared &&
                            !dependenciesAreLocal &&
                            serverIsConnected && (
                                <SyncWorkspaceButton
                                    isLocal={dependenciesAreLocal}
                                    syncPayload={syncPayload}
                                    buttonLabel="Sync Model Weights"
                                />
                            )}

                        {/* Fine Tune / Sync Button Container */}
                        {serverIsConnected && (
                            <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
                                <button
                                    onClick={handleFineTuneAction}
                                    disabled={isSyncing}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                                    title={
                                        dependenciesAreLocal
                                            ? "Load this configuration for fine-tuning or cloning"
                                            : "Sync required data and weights before fine-tuning"
                                    }
                                >
                                    {isSyncing ? (
                                        <Loader2
                                            size={16}
                                            className="animate-spin shrink-0"
                                        />
                                    ) : dependenciesAreLocal ? (
                                        <GitFork
                                            size={16}
                                            className="shrink-0"
                                        />
                                    ) : (
                                        <DownloadCloud
                                            size={16}
                                            className="shrink-0"
                                        />
                                    )}

                                    <span>
                                        {isSyncing
                                            ? "Syncing Weights..."
                                            : dependenciesAreLocal
                                              ? "Fine-Tune Weights"
                                              : "Sync & Fine-Tune"}
                                    </span>
                                </button>

                                {/* Error Message Display */}
                                {syncError && (
                                    <div className="flex items-center gap-1 text-red-600 text-xs font-medium max-w-xs text-right mt-1">
                                        <AlertCircle
                                            size={14}
                                            className="shrink-0"
                                        />
                                        <span>{syncError}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {isLocal && (
                            <div className="w-full sm:w-auto">
                                <DeleteButton
                                    targetHash={modelHash}
                                    targetType="model"
                                    mode="local"
                                    buttonLabel="Delete Local Model"
                                />
                            </div>
                        )}
                    </div>

                    {linkedEvals.length === 0 ? (
                        <p className="text-[11px] font-medium text-slate-400 italic pl-4 sm:pl-8 py-1">
                            No zero-shot evaluations generated for this weights
                            configuration.
                        </p>
                    ) : (
                        linkedEvals.map(([evalHash, evalObj]) => (
                            <EvaluationNode
                                key={evalHash}
                                evalHash={evalHash}
                                evalObj={evalObj}
                                solverType={solverType}
                                serverIsConnected={serverIsConnected}
                                registry={registry}
                                isSelectedForArena={selectedArenaHashes?.has(
                                    evalHash,
                                )}
                                onToggleArena={onToggleArena}
                                referenceArenaCandidate={
                                    referenceArenaCandidate
                                }
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
