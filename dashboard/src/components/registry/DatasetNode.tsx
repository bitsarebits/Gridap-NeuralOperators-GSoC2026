import { useState } from "react";
import {
    Database,
    ChevronDown,
    ChevronRight,
    Cloud,
    HardDrive,
} from "lucide-react";
import ConfigGrid from "../ui/ConfigGrid";
import ModelNode from "./ModelNode";
import type { RegistryData } from "../../types";
import DeleteButton from "../ui/DeleteButton";

interface Props {
    dataHash: string;
    femConfig: any;
    registry: RegistryData;
    serverIsConnected: boolean;
}

export default function DatasetNode({
    dataHash,
    femConfig,
    registry,
    serverIsConnected,
}: Props) {
    const [isExpanded, setIsExpanded] = useState(false);

    const isShared = femConfig._isShared;
    const isLocal = femConfig._isLocal;

    const linkedModels = Object.entries(registry.models).filter(
        ([_, m]) => m.data_hash === dataHash,
    );

    return (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden transition-all">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-5 flex items-center justify-between cursor-pointer transition-colors select-none ${isExpanded ? "bg-slate-50/70 border-b border-slate-100" : "hover:bg-slate-50/40"}`}
            >
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-600">
                        <Database size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                                FEM Snapshots Dataset
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
                            <span className="font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-semibold select-all">
                                {dataHash}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Beta space: [{femConfig.beta_start} :{" "}
                            {femConfig.beta_step} : {femConfig.beta_end}] | Mesh
                            (nx): {femConfig.nx}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                        {linkedModels.length}{" "}
                        {linkedModels.length === 1 ? "Model" : "Models"}
                    </span>
                    {isExpanded ? (
                        <ChevronDown size={18} className="text-slate-400" />
                    ) : (
                        <ChevronRight size={18} className="text-slate-400" />
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="bg-slate-50/30 p-4 flex flex-col gap-3 border-b border-slate-100 animate-in slide-in-from-top-2 duration-200">
                    <ConfigGrid
                        title="Physical & Numerical Setup"
                        configObj={femConfig}
                    />

                    {isLocal && (
                        <div className="flex justify-end my-1">
                            <DeleteButton
                                targetHash={dataHash}
                                targetType="data"
                                mode="local"
                                buttonLabel="Delete Local Dataset & All Linked Models"
                            />
                        </div>
                    )}

                    {linkedModels.length === 0 ? (
                        <p className="text-xs font-medium text-slate-400 italic pl-12 py-2">
                            No neural operators trained yet using this
                            high-fidelity mesh dataset.
                        </p>
                    ) : (
                        linkedModels.map(([modelHash, modelObj]) => (
                            <ModelNode
                                key={modelHash}
                                modelHash={modelHash}
                                modelObj={modelObj}
                                registry={registry}
                                serverIsConnected={serverIsConnected}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
