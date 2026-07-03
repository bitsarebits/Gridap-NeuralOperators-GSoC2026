import { useState } from "react";
import {
    Brain,
    ChevronDown,
    ChevronRight,
    Cloud,
    HardDrive,
} from "lucide-react";
import ConfigGrid from "../ui/ConfigGrid";
import EvaluationNode from "./EvaluationNode";
import type { RegistryData } from "../../types";

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
    const epochs = solver.epochs || solver.n_epochs || "N/A";

    let archInfo = "";
    if (solverType.includes("FNO")) {
        const modes = Array.isArray(solver.modes)
            ? solver.modes.join(", ")
            : typeof solver.modes === "object"
              ? Object.values(solver.modes).join(", ")
              : solver.modes;
        archInfo = `modes: [${modes || "N/A"}]`;
    } else {
        archInfo = `p_latent: ${solver.p_latent || "N/A"}, hidden: ${solver.hidden || "N/A"}`;
    }

    const configToRender = modelObj.solver ? modelObj.solver : modelObj;

    return (
        <div className="bg-white border border-slate-200/70 rounded-xl shadow-xs overflow-hidden">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors select-none ${isExpanded ? "bg-blue-50/40 border-b border-slate-100" : "hover:bg-slate-50/50"}`}
            >
                <div className="flex items-center gap-3 pl-2">
                    <Brain size={18} className="text-blue-600" />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-800">
                                {solverType} Weights
                            </span>
                            {isShared && (
                                <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                                    <Cloud size={12} /> Cloud
                                </span>
                            )}
                            {isLocal && !isShared && (
                                <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">
                                    <HardDrive size={12} /> Local
                                </span>
                            )}
                            <span className="font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[11px] font-medium select-all">
                                {modelHash}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Epochs: {epochs} | Architecture: {archInfo}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
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
                        configObj={configToRender}
                    />

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
