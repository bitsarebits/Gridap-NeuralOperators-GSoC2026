import axios from "axios";
import type {
    CacheCheckResponse,
    PlotResponse,
    RegistryData,
    RegistryResponse,
    SharePayload,
    ShareResponse,
    SimulationPayload,
    SyncPayload,
} from "../types";

const FIREBASE_PROJECT_ID = "gridap-gsoc2026";
const FIRESTORE_API_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/shared_experiments`;

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

// Firestore

/**
 * Parses Firestore's strict typed JSON into a JavaScript object.
 */
function parseFirestoreValue(val: any): any {
    if (!val) return null;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
    if (val.doubleValue !== undefined) return parseFloat(val.doubleValue);
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.nullValue !== undefined) return null;

    if (val.arrayValue !== undefined) {
        return (val.arrayValue.values || []).map(parseFirestoreValue);
    }
    if (val.mapValue !== undefined) {
        const result: Record<string, any> = {};
        const fields = val.mapValue.fields || {};
        for (const key in fields) {
            result[key] = parseFirestoreValue(fields[key]);
        }
        return result;
    }
    return val;
}

/**
 * Fetches shared experiments directly from Firestore REST API.
 */
export const fetchSharedRegistry = async (): Promise<RegistryData> => {
    try {
        const response = await axios.get(FIRESTORE_API_URL);
        const documents = response.data.documents || [];

        const sharedRegistry: RegistryData = {
            data: {},
            models: {},
            evaluations: {},
        };

        documents.forEach((doc: any) => {
            const parsedDoc = parseFirestoreValue({
                mapValue: { fields: doc.fields },
            });

            const dataHash = parsedDoc.hashes.data_hash;
            const modelHash = parsedDoc.hashes.model_hash;
            const evalHash = parsedDoc.hashes.eval_hash;

            // Reconstruct the nested structure
            sharedRegistry.data[dataHash] = {
                ...parsedDoc.fem_config,
                _isShared: true, // Metadata flag for UI
            };

            sharedRegistry.models[modelHash] = {
                ...parsedDoc.solver_config,
                solver_type: parsedDoc.model_type,
                data_hash: dataHash,
                _isShared: true,
            };

            sharedRegistry.evaluations[evalHash] = {
                ...parsedDoc.eval_config,
                model_hash: modelHash,
                image_url: parsedDoc.image_url, // Store the public Firebase Storage URL
                _isShared: true,
            };
        });

        return sharedRegistry;
    } catch (error) {
        console.error("Failed to fetch shared registry from Firestore", error);
        return { data: {}, models: {}, evaluations: {} };
    }
};

export const syncExperimentLocally = async (
    payload: SyncPayload,
): Promise<{ status: string; message?: string }> => {
    const response = await api.post("/api/sync_experiment", payload);
    return response.data;
};

export const deleteLocalItem = async (
    type: "data" | "model" | "evaluation",
    hash: string,
): Promise<{ status: string; message: string }> => {
    const response = await api.post("/api/delete_local", { type, hash });
    return response.data;
};

export const deleteSharedExperiment = async (
    evalHash: string,
    modelHash: string,
    dataHash: string,
): Promise<{ status: string; message: string }> => {
    const response = await api.post("/api/delete_shared", {
        eval_hash: evalHash,
        model_hash: modelHash,
        data_hash: dataHash,
    });
    return response.data;
};
