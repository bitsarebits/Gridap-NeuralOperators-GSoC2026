import { useState } from "react";
import {
    Share2,
    Loader2,
    CheckCircle,
    ExternalLink,
    AlertCircle,
} from "lucide-react";
import {
    checkShareStatus,
    evaluationArtifactUrl,
    shareExperiment,
} from "../../api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSafeUrl } from "../../utils/sanitize";

interface ShareButtonProps {
    evalHash: string;
}

export default function ShareButton({ evalHash }: ShareButtonProps) {
    const [isSharing, setIsSharing] = useState<boolean>(false);
    const [hasPublished, setHasPublished] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [alreadyExists, setAlreadyExists] = useState<boolean>(false);

    const queryClient = useQueryClient();

    const { data: canShare = false } = useQuery({
        queryKey: ["server", "canShare"],
        queryFn: checkShareStatus,
        staleTime: Infinity,
    });

    // If the server doesn't have Firebase credentials, hide the button completely
    if (!canShare) return null;

    const handleShare = async () => {
        setIsSharing(true);
        setError(null);
        try {
            const res = await shareExperiment({
                eval_hash: evalHash,
            });
            if (res.status === "success" && res.public_url) {
                setAlreadyExists(!!res.already_exists);

                // Invalidate tanstack cache
                await queryClient.invalidateQueries({
                    queryKey: ["registry", "merged"],
                });

                setHasPublished(true);
            }
        } catch (err: any) {
            setError(
                err.message ||
                    "An unexpected error occurred during publishing.",
            );
        } finally {
            setIsSharing(false);
        }
    };

    if (hasPublished) {
        const viewUrl = evaluationArtifactUrl(evalHash);
        return (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-green-50 text-green-700 px-3 sm:px-4 py-2 rounded-lg border border-green-200">
                <CheckCircle size={16} className="shrink-0" />
                <span className="text-xs sm:text-sm font-medium">
                    {alreadyExists ? "Already Public!" : "Published!"}
                </span>
                {isSafeUrl(viewUrl) && (
                    <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs sm:text-sm bg-white px-2 py-1 rounded shadow-sm hover:bg-green-100 transition-colors"
                    >
                        View JSON <ExternalLink size={14} />
                    </a>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                onClick={handleShare}
                disabled={isSharing}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all shadow-sm hover:shadow disabled:opacity-70 disabled:cursor-not-allowed"
                title="Publish securely to global Firebase gallery"
            >
                {isSharing ? (
                    <Loader2 size={16} className="animate-spin shrink-0" />
                ) : (
                    <Share2 size={16} className="shrink-0" />
                )}
                <span>{isSharing ? "Publishing..." : "Share to Gallery"}</span>
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
