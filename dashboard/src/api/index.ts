import axios from "axios";
import type {
    CacheCheckResponse,
    PlotResponse,
    RegistryResponse,
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
