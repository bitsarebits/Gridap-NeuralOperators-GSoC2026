import axios from "axios";
import type { SimulationPayload, SimulationResponse } from "../types";

// Base instance for Axios
export const api = axios.create({
    baseURL: "http://localhost:8080",
    headers: {
        "Content-Type": "application/json",
    },
});

// Function for the simulation
export const runSimulation = async (
    payload: SimulationPayload,
): Promise<SimulationResponse> => {
    const response = await api.post<SimulationResponse>(
        "/api/run_model",
        payload,
    );
    return response.data;
};
