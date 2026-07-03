import { useState } from "react";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteLocalItem, deleteSharedExperiment } from "../../api";

interface Props {
    targetHash: string;
    targetType: "data" | "model" | "evaluation";
    mode: "local" | "cloud";
    buttonLabel?: string;
    parentModelHash?: string;
    parentDataHash?: string;
    onSuccess?: () => void;
}

export default function DeleteButton({
    targetHash,
    targetType,
    mode,
    buttonLabel = "Delete",
    parentModelHash,
    parentDataHash,
    onSuccess,
}: Props) {
    const [confirmPhase, setConfirmPhase] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const queryClient = useQueryClient();

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            if (mode === "local") {
                await deleteLocalItem(targetType, targetHash);
            } else if (mode === "cloud" && targetType === "evaluation") {
                await deleteSharedExperiment(
                    targetHash,
                    parentModelHash || "",
                    parentDataHash || "",
                );
            }

            // Invalidate cache to remove the item from UI
            queryClient.invalidateQueries({ queryKey: ["registry", "merged"] });
            if (onSuccess) {
                onSuccess();
            }
        } catch (error) {
            console.error("Failed to delete:", error);
            alert("Failed to delete the selected item.");
            setConfirmPhase(false);
        } finally {
            setIsDeleting(false);
        }
    };

    if (confirmPhase) {
        return (
            <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200 animate-in fade-in duration-200">
                <div className="text-xs text-red-700 font-semibold px-2 flex items-center gap-1">
                    <AlertTriangle size={14} /> Sure?
                </div>
                <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded shadow-sm disabled:opacity-50 transition-colors"
                >
                    {isDeleting ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        "Yes, Delete"
                    )}
                </button>
                <button
                    onClick={() => setConfirmPhase(false)}
                    disabled={isDeleting}
                    className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                    title="Cancel"
                >
                    <X size={16} />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={(e) => {
                e.stopPropagation(); // Prevent the opening/closing of the accordion
                setConfirmPhase(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm rounded-lg transition-all"
            title={`Delete ${mode} ${targetType}`}
        >
            <Trash2 size={14} />
            {buttonLabel}
        </button>
    );
}
