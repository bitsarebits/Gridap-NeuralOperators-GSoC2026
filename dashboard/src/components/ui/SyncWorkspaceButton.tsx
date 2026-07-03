import { useState } from "react";
import { DownloadCloud, Loader2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { syncExperimentLocally } from "../../api";
import type { SyncPayload } from "../../types";

interface Props {
    syncPayload: SyncPayload;
    isLocal: boolean;
}

export default function SyncWorkspaceButton({ syncPayload, isLocal }: Props) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // If it's already in the local DrWatson structure, don't show the button
    if (isLocal) return null;

    const handleSync = async () => {
        setIsSyncing(true);
        setError(null);
        try {
            const res = await syncExperimentLocally(syncPayload);
            if (res.status === "success") {
                // Invalidate the cache to trigger a UI refresh
                // The item will now receive the 'HardDrive' Local badge
                queryClient.invalidateQueries({
                    queryKey: ["registry", "merged"],
                });
            }
        } catch (err: any) {
            setError(
                err.response?.data?.message ||
                    "Failed to sync experiment locally.",
            );
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-semibold transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                title="Download FEM data and Model weights to your local DrWatson folders"
            >
                {isSyncing ? (
                    <Loader2 size={18} className="animate-spin" />
                ) : (
                    <DownloadCloud size={18} />
                )}
                {isSyncing ? "Syncing to local..." : "Sync to Workspace"}
            </button>

            {error && (
                <div className="flex items-center gap-1 text-red-600 text-xs font-medium max-w-xs text-right">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
