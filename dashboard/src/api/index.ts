import axios from "axios";
import type {
    CacheCheckResponse,
    PlotResponse,
    RegistryResponse,
    SharePayload,
    ShareResponse,
    SimulationPayload,
} from "../types";

// Base instance for Axios
export const api = axios.create({
    baseURL: "http://localhost:8080",
    headers: {
        "Content-Type": "application/json",
    },
});

export const pingServer = async (): Promise<boolean> => {
    try {
        const response = await api.get("/api/ping");
        return response.data.status === "ok";
    } catch (error) {
        return false;
    }
};

export const checkRegistry = async (
    payload: SimulationPayload,
): Promise<CacheCheckResponse> => {
    const response = await api.post<CacheCheckResponse>(
        "/api/check_registry",
        payload,
    );
    return response.data;
};

export const fetchRegistry = async (): Promise<RegistryResponse> => {
    const response = await api.get<RegistryResponse>("/api/registry");
    return response.data;
};

export const fetchEvaluationPlot = async (
    evalHash: string,
    solverType: string,
): Promise<PlotResponse> => {
    const response = await api.post<PlotResponse>("/api/get_evaluation_plot", {
        eval_hash: evalHash,
        solver_type: solverType,
    });
    return response.data;
};

export const checkShareStatus = async (): Promise<boolean> => {
    try {
        const response = await api.get("/api/status");
        return response.data.canShare === true;
    } catch (error) {
        console.error("Failed to check share status", error);
        return false;
    }
};

export const shareExperiment = async (
    payload: SharePayload,
): Promise<ShareResponse> => {
    try {
        const response = await api.post<ShareResponse>("/api/share", payload);
        return response.data;
    } catch (error: any) {
        if (
            error.response &&
            error.response.data &&
            error.response.data.message
        ) {
            throw new Error(error.response.data.message);
        }

        // Fallback
        throw new Error(
            "Failed to connect to the server to share the experiment.",
        );
    }
};
