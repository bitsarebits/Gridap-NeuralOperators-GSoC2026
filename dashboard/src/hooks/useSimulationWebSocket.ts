import { useState, useRef, useEffect, useCallback } from "react";
import type { SimulationPayload, SimulationResponse } from "../types";

const SESSION_KEY = "gridap_simulation_session_id";
const WS_URL = "ws://127.0.0.1:8080/ws/simulate";

// Interface for the exit Request message
interface WebSocketRequest {
    action: "start" | "reconnect" | "stop";
    data?: SimulationPayload; // Optional (not required for "stop" or "reconnect")
    session_id?: string; // Optional (first connection)
}

// Interface for the internal progress
interface SimulationProgress {
    epoch: number;
    total: number;
    loss: number;
    eta: number;
}

export const useSimulationSocket = (
    serverStatus: "connected" | "connecting" | "disconnected",
) => {
    // References
    const wsRef = useRef<WebSocket | null>(null);
    const promiseRef = useRef<{
        resolve: (value: SimulationResponse) => void;
        reject: (reason: Error) => void;
    } | null>(null);

    // State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SimulationResponse | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [progress, setProgress] = useState<SimulationProgress | null>(null);

    // Helper: retrieve a clean session ID (prevents JS string literal bugs)
    const getActiveSession = () => {
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved && saved !== "undefined" && saved !== "null") {
            return saved;
        }
        return null;
    };

    // Internal function to handle the socket opening
    const connectSocket = useCallback(
        (
            action: "start" | "reconnect",
            payload?: SimulationPayload,
            resolveCb?: (value: SimulationResponse) => void,
            rejectCb?: (reason: Error) => void,
        ) => {
            setIsLoading(true);
            setError(null);

            if (resolveCb && rejectCb) {
                promiseRef.current = { resolve: resolveCb, reject: rejectCb };
            }

            // Cleanup
            if (action === "start") {
                setResult(null);
                setProgress(null);
                setStatusMessage("");
            }

            const socket = new WebSocket(WS_URL);
            wsRef.current = socket;

            socket.onopen = () => {
                const savedSession = getActiveSession();
                setStatusMessage(
                    action === "reconnect"
                        ? "Reconnecting to running pipeline..."
                        : "Starting pipeline...",
                );

                const message: WebSocketRequest = {
                    action: action,
                    data: payload,
                };

                if (savedSession) {
                    message.session_id = savedSession;
                }

                socket.send(JSON.stringify(message));
            };

            socket.onmessage = (event: MessageEvent) => {
                const res = JSON.parse(event.data);

                switch (res.type) {
                    case "session_info":
                        // The backend confermed a session ID -> store it
                        if (res.session_id) {
                            sessionStorage.setItem(SESSION_KEY, res.session_id);
                        }
                        break;
                    case "status":
                        setStatusMessage(res.stage || res.message);
                        break;
                    case "progress":
                        setStatusMessage(res.stage);
                        setProgress({
                            epoch: res.epoch,
                            total: res.total_epochs,
                            loss: res.loss,
                            eta: res.eta,
                        });
                        break;
                    case "success":
                        const successData = {
                            data_hash: res.data_hash,
                            model_hash: res.model_hash,
                            eval_hash: res.eval_hash,
                            image_url: res.image_url,
                        };
                        setResult(successData);
                        setIsLoading(false);
                        sessionStorage.removeItem(SESSION_KEY); // successfully terminated: session cleanup
                        socket.close();

                        // Resolve the Promise so onSubmit can continue!
                        if (promiseRef.current) {
                            promiseRef.current.resolve(successData);
                            promiseRef.current = null;
                        }
                        break;
                    case "error":
                        setError(res.message);
                        setIsLoading(false);
                        setStatusMessage("");
                        setResult(null); // Clear previous success results on error
                        setProgress(null); // Clear previous progress charts on error
                        sessionStorage.removeItem(SESSION_KEY); // Error: session cleanup
                        socket.close();

                        // Reject the Promise so onSubmit catches the error
                        if (promiseRef.current) {
                            promiseRef.current.reject(new Error(res.message));
                            promiseRef.current = null;
                        }
                        break;
                }
            };

            socket.onerror = () => {
                const errMsg = "WebSocket connection failed or lost.";
                setError(errMsg);
                setIsLoading(false);
                if (promiseRef.current) {
                    promiseRef.current.reject(new Error(errMsg));
                    promiseRef.current = null;
                }
            };

            socket.onclose = (event) => {
                // Anomaly connection lost (server crash)
                // Remove the loading state to unlock the UI
                if (!event.wasClean) {
                    setIsLoading(false);
                    setStatusMessage("");

                    // In case of silent crashes, ensure reject
                    if (promiseRef.current) {
                        promiseRef.current.reject(
                            new Error("Server crashed unexpectedly."),
                        );
                        promiseRef.current = null;
                    }
                }
            };
        },
        [],
    );

    // Try to automatically reconnect if there is an active session while loading
    useEffect(() => {
        const savedSession = getActiveSession();
        // Reconnect only if the server is online, there is a stored session and we are not loading
        if (serverStatus === "connected" && savedSession && !isLoading) {
            connectSocket("reconnect");
        }
    }, [serverStatus, connectSocket, isLoading]);

    const startSimulation = (
        payload: SimulationPayload,
    ): Promise<SimulationResponse> => {
        return new Promise((resolve, reject) => {
            connectSocket("start", payload, resolve, reject);
        });
    };

    const abortSimulation = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const stopMessage: WebSocketRequest = { action: "stop" };
            wsRef.current.send(JSON.stringify(stopMessage));
            setStatusMessage("Aborting... Waiting for Julia threads to yield.");
            // We don't delete the session here, we wait for the "error" event from the server
            // with the message "Simulation interrupted by the user"
        }
    };

    return {
        isLoading,
        error,
        result,
        statusMessage,
        progress,
        startSimulation,
        abortSimulation,
    };
};
