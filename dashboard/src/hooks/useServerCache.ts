import { useState, useEffect, useCallback } from "react";
import { checkRegistry } from "../api";
import type { CacheCheckResponse, SimulationPayload } from "../types";

export const useServerCache = (
    formValues: any,
    isValid: boolean,
    serverStatus: "connected" | "connecting" | "disconnected",
) => {
    const [cacheStatus, setCacheStatus] = useState<CacheCheckResponse | null>(
        null,
    );
    const [isCheckingCache, setIsCheckingCache] = useState(false);
    const [cacheError, setCacheError] = useState<string | null>(null);

    const refreshCache = useCallback(async () => {
        if (serverStatus !== "connected" || !isValid) {
            setCacheStatus(null);
            setCacheError(null);
            return;
        }

        setIsCheckingCache(true);
        setCacheError(null);

        try {
            // formValues must be casted to SimulationPayload
            const res = await checkRegistry(formValues as SimulationPayload);
            if (res.status === "success") {
                setCacheStatus(res);
            } else {
                setCacheStatus(null);
            }
        } catch (err) {
            console.error("Cache check error:", err);
            setCacheStatus(null);
            setCacheError(
                "Failed to verify cache status. Server might be busy.",
            );
        } finally {
            setIsCheckingCache(false);
        }
    }, [JSON.stringify(formValues), serverStatus, isValid]);

    // Cache check logic (Debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            refreshCache();
        }, 600);

        return () => clearTimeout(timer);
    }, [refreshCache]);

    return { cacheStatus, isCheckingCache, refreshCache, cacheError };
};
