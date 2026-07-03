import { useState } from "react";
import {
    Brain,
    ChevronDown,
    ChevronRight,
    Cloud,
    HardDrive,
} from "lucide-react";
import ConfigGrid, { FORBIDDEN_KEYS } from "../ui/ConfigGrid";
import EvaluationNode from "./EvaluationNode";
import type { RegistryData } from "../../types";
import DeleteButton from "../ui/DeleteButton";

interface Props {
    modelHash: string;
    modelObj: any;
    registry: RegistryData;
    serverIsConnected: boolean;
}

export default function ModelNode({
    modelHash,
    modelObj,
    registry,
    serverIsConnected,
}: Props) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Metadata flags
    const isShared = modelObj._isShared;
    const isLocal = modelObj._isLocal;

    // Filter evaluations linking to this model
    const linkedEvals = Object.entries(registry.evaluations).filter(
        ([_, e]) => e.model_hash === modelHash,
    );

    // Safe Parsing for Backward Compatibility
    const solver = modelObj.solver || modelObj;
    const solverType =
        modelObj.solver_type ||
        (modelObj.model_type
            ? `${modelObj.model_type}Solver`
            : "UnknownSolver");

    const buildCompactModelString = () => {
        const parts: string[] = [];

        // Specific group for DeepONet
        if (solverType.includes("DeepONet")) {
            if (solver.p_latent !== undefined && solver.hidden !== undefined) {
                parts.push(`p=${solver.p_latent} • hidden=${solver.hidden}`);
            }
            if (solver.m_sensors !== undefined)
                parts.push(`m=${solver.m_sensors}`);
        }

        // Specific Group for FNO
        if (solverType.includes("FNO")) {
            if (solver.modes !== undefined) {
                // Both array [16] and object {"1": 16} for retro-compatibility
                const m = Array.isArray(solver.modes)
                    ? `[${solver.modes.join(",")}]`
                    : typeof solver.modes === "object"
                      ? `[${Object.values(solver.modes).join(",")}]`
                      : solver.modes;
                parts.push(`modes=${m}`);
            }
            if (solver.hidden_channels !== undefined) {
                const hc = Array.isArray(solver.hidden_channels)
                    ? `[${solver.hidden_channels.join(",")}]`
                    : typeof solver.hidden_channels === "object"
                      ? `[${Object.values(solver.hidden_channels).join(",")}]`
                      : solver.hidden_channels;
                parts.push(`channels=${hc}`);
            }
        }

        // Shared parameters (Training & Learning Rate)
        const epochs = solver.epochs || solver.n_epochs;
        if (epochs !== undefined) parts.push(`epochs=${epochs}`);

        if (solver.lr_scheduler?.lr_max !== undefined) {
            parts.push(`lr_max=${solver.lr_scheduler.lr_max}`);
        }

        // Add remaining parameters
        const groupedKeys = [
            "p_latent",
            "hidden",
            "m_sensors",
            "modes",
            "hidden_channels",
            "epochs",
            "n_epochs",
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

    return (
        <div className="bg-white border-t border-slate-100 transition-all">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-4 pl-12 flex items-center justify-between cursor-pointer transition-colors select-none ${isExpanded ? "bg-slate-50/50" : "hover:bg-slate-50/30"}`}
            >
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100 text-indigo-600 shrink-0">
                        <Brain size={18} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800">
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

                            <span className="font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-semibold select-all">
                                {modelHash}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 font-mono leading-relaxed wrap-break-words">
                            {compactConfigString}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
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
                <div className="bg-slate-50/20 p-4 flex flex-col gap-3 animate-in slide-in-from-top-1 duration-150">
                    <ConfigGrid
                        title="Architecture & Training Configuration"
                        configObj={solver}
                    />

                    {isLocal && (
                        <div className="flex justify-end my-1">
                            <DeleteButton
                                targetHash={modelHash}
                                targetType="model"
                                mode="local"
                                buttonLabel="Delete Local Model & All Linked Plots"
                            />
                        </div>
                    )}

                    {linkedEvals.length === 0 ? (
                        <p className="text-[11px] font-medium text-slate-400 italic pl-8 py-1">
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
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
