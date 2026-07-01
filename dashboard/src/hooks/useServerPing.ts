import { useState, useEffect } from "react";
import { pingServer } from "../api";

export const useServerPing = () => {
    const [serverStatus, setServerStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("connecting");

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
        // Check less frequently if already connected
        const intervalId = setInterval(
            checkServer,
            serverStatus === "connected" ? 15000 : 2500,
        );

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [serverStatus]);

    return serverStatus;
};
