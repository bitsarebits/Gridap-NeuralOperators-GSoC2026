import axios from "axios";
import type {
    CacheCheckResponse,
    SimulationPayload,
    SimulationResponse,
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
