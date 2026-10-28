import { useState, useRef, useEffect, useCallback } from "react";
import type {
    LossPoint,
    SimulationPayload,
    SimulationResponse,
} from "../types";

const SESSION_KEY = "gridap_simulation_session_id";

// Dynamically build the WebSocket URL from the current browser location.
// Automatically switches to wss:// when accessed over HTTPS (e.g. VS Code Web Tunnels).
const getWsUrl = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/simulate`;
};

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
    const [lossHistory, setLossHistory] = useState<LossPoint[]>([]);
    const [isAborting, setIsAborting] = useState(false);

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
            setIsAborting(false);
            setIsLoading(true);
            setError(null);

            if (resolveCb && rejectCb) {
                promiseRef.current = { resolve: resolveCb, reject: rejectCb };
            }

            // Cleanup
            if (action === "start") {
                setResult(null);
                setProgress(null);
                setLossHistory([]);
                setStatusMessage("");
            }

            const socket = new WebSocket(getWsUrl());
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
                if (wsRef.current !== socket) return;
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
                        setLossHistory((prev) => {
                            if (
                                prev.length > 0 &&
                                prev[prev.length - 1].epoch === res.epoch
                            ) {
                                return prev;
                            }
                            return [
                                ...prev,
                                { epoch: res.epoch, loss: res.loss },
                            ];
                        });
                        break;
                    case "success": {
                        const successData: SimulationResponse = {
                            data_hash: res.data_hash,
                            model_hash: res.model_hash,
                            eval_hash: res.eval_hash,
                            eval_data: res.eval_data,
                        };
                        setIsAborting(false);
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
                    }
                    case "error":
                        setIsAborting(false);
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
                if (wsRef.current !== socket) return;
                const errMsg = "WebSocket connection failed or lost.";
                setError(errMsg);
                setIsLoading(false);
                setIsAborting(false);
                if (promiseRef.current) {
                    promiseRef.current.reject(new Error(errMsg));
                    promiseRef.current = null;
                }
            };

            socket.onclose = (event) => {
                if (wsRef.current !== socket) return;

                wsRef.current = null;

                // A terminal success/error event has already handled the UI state.
                // Otherwise, unlock the UI and allow the session-reconnect effect
                // to reconnect if the session is still stored.
                setIsLoading(false);
                setIsAborting(false);

                const savedSession = getActiveSession();

                if (savedSession) {
                    setStatusMessage(
                        "Connection closed. Checking simulation session...",
                    );
                } else {
                    setStatusMessage("");
                }

                if (promiseRef.current) {
                    promiseRef.current.reject(
                        new Error(
                            event.wasClean
                                ? "WebSocket closed before the simulation returned a result."
                                : "WebSocket connection lost unexpectedly.",
                        ),
                    );
                    promiseRef.current = null;
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

    useEffect(() => {
        return () => {
            const socket = wsRef.current;
            wsRef.current = null;

            if (
                socket &&
                socket.readyState !== WebSocket.CLOSED &&
                socket.readyState !== WebSocket.CLOSING
            ) {
                try {
                    socket.close(1000, "Orchestrator view unmounted");
                } catch {
                    // The socket may already be closing.
                }
            }
        };
    }, []);

    const startSimulation = (
        payload: SimulationPayload,
    ): Promise<SimulationResponse> => {
        return new Promise((resolve, reject) => {
            connectSocket("start", payload, resolve, reject);
        });
    };

    const abortSimulation = () => {
        if (
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN &&
            !isAborting
        ) {
            setIsAborting(true);
            const stopMessage: WebSocketRequest = { action: "stop" };
            wsRef.current.send(JSON.stringify(stopMessage));
            setStatusMessage(
                "Cancellation requested. If Reactant/Enzyme/XLA is compiling the first training step, stopping may take a few minutes. The pipeline will stop when the compilation returns.",
            );
        }
    };

    const clearResult = useCallback(() => {
        setResult(null);
        setError(null);
        setProgress(null);
        setLossHistory([]);
        setStatusMessage("");
    }, []);

    return {
        isLoading,
        error,
        result,
        statusMessage,
        progress,
        lossHistory,
        startSimulation,
        abortSimulation,
        clearResult,
        isAborting,
    };
};
