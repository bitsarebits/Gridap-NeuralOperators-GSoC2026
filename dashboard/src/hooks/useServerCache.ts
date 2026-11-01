import { useState, useEffect, useCallback, useRef } from "react";
import { useWatch, type Control } from "react-hook-form";
import { checkRegistry } from "../api";
import type { CacheCheckResponse, SimulationPayload } from "../types";
import { formSchema, type SimulationFormValues } from "../schemas/simulation";

export const useServerCache = (
    control: Control<SimulationFormValues>,
    buildPayload: (data: SimulationFormValues) => SimulationPayload,
    serverStatus: "connected" | "connecting" | "disconnected",
) => {
    const [cacheStatus, setCacheStatus] = useState<CacheCheckResponse | null>(
        null,
    );
    const [isCheckingCache, setIsCheckingCache] = useState(false);
    const [cacheError, setCacheError] = useState<string | null>(null);

    // useWatch isola i re-render qui dentro senza far ri-renderizzare OrchestratorView
    const watchedValues = useWatch({ control });
    const latestValuesRef = useRef(watchedValues);
    latestValuesRef.current = watchedValues;

    const refreshCache = useCallback(async () => {
        if (serverStatus !== "connected") {
            setCacheStatus(null);
            setCacheError(null);
            return;
        }

        const parsed = formSchema.safeParse(latestValuesRef.current);
        if (!parsed.success) {
            setCacheStatus(null);
            setCacheError(null);
            return;
        }

        setIsCheckingCache(true);
        setCacheError(null);

        try {
            const payload = buildPayload(parsed.data);
            const res = await checkRegistry(payload);
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
    }, [serverStatus, buildPayload]);

    // Debounce on watchedValues: execute safeParse and the API call only after 600ms of inactivity
    useEffect(() => {
        const timer = setTimeout(() => {
            refreshCache();
        }, 600);

        return () => clearTimeout(timer);
    }, [watchedValues, refreshCache]);

    return { cacheStatus, isCheckingCache, refreshCache, cacheError };
};
