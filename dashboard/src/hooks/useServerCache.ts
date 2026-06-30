import { useState, useEffect } from "react";
import { checkRegistry, pingServer } from "../api";
import type { CacheCheckResponse, SimulationPayload } from "../types";

export const useServerCache = (formValues: any, isValid: boolean) => {
    const [serverStatus, setServerStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("connecting");
    const [cacheStatus, setCacheStatus] = useState<CacheCheckResponse | null>(
        null,
    );
    const [isCheckingCache, setIsCheckingCache] = useState(false);

    // Ping logic
    useEffect(() => {
        let isMounted = true;
        let retries = 0;
        const MAX_RETRIES = 48;

        const checkServer = async () => {
            const isAlive = await pingServer();
            if (!isMounted) return;

            if (isAlive) {
                if (serverStatus !== "connected") setServerStatus("connected");
                retries = 0;
            } else {
                retries++;
                setServerStatus((prev) => {
                    if (prev === "connected") return "disconnected";
                    if (prev === "connecting" && retries > MAX_RETRIES)
                        return "disconnected";
                    return prev;
                });
            }
        };

        checkServer();
        const intervalId = setInterval(
            checkServer,
            serverStatus === "connected" ? 15000 : 2500,
        );
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [serverStatus]);

    // Cache check logic (Debounced)
    useEffect(() => {
        if (serverStatus !== "connected") return;
        if (!isValid) {
            setCacheStatus(null);
            return;
        }

        const timer = setTimeout(async () => {
            setIsCheckingCache(true);
            try {
                // formValues must be casted to SimulationPayload
                const res = await checkRegistry(
                    formValues as SimulationPayload,
                );
                if (res.status === "success") setCacheStatus(res);
            } catch (err) {
                console.error("Cache check error:", err);
            } finally {
                setIsCheckingCache(false);
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [JSON.stringify(formValues), serverStatus, isValid]);

    return { serverStatus, cacheStatus, isCheckingCache };
};
