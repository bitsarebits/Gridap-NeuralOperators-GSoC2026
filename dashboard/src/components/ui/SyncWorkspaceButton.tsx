import { useState } from "react";
import { DownloadCloud, Loader2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { syncExperimentLocally } from "../../api";
import type { SyncPayload } from "../../types";

interface Props {
    syncPayload: SyncPayload;
    isLocal: boolean;
    buttonLabel?: string;
}

export default function SyncWorkspaceButton({
    syncPayload,
    isLocal,
    buttonLabel = "Sync to Workspace",
}: Props) {
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
        <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                title="Download required files to your local DrWatson folders"
            >
                {isSyncing ? (
                    <Loader2 size={16} className="animate-spin shrink-0" />
                ) : (
                    <DownloadCloud size={16} className="shrink-0" />
                )}
                <span>{isSyncing ? "Syncing..." : buttonLabel}</span>
            </button>

            {error && (
                <div className="flex items-center gap-1 text-red-600 text-xs font-medium max-w-xs text-right mt-1">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
