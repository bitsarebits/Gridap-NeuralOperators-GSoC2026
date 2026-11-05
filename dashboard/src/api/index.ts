import axios from "axios";
import type {
    CacheCheckResponse,
    InteractiveEvalData,
    PlotResponse,
    RegistryData,
    RegistryResponse,
    SharePayload,
    ShareResponse,
    SimulationPayload,
    SyncPayload,
} from "../types";

const FIREBASE_PROJECT_ID = "gridap-gsoc2026";

// Proxies for Firestore catalog and Storage plot artifacts
const SHARED_REGISTRY_PROXY_URL =
    import.meta.env.VITE_SHARED_REGISTRY_URL ||
    `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/getSharedExperiments`;

const ARTIFACT_PROXY_BASE_URL =
    import.meta.env.VITE_ARTIFACT_PROXY_URL ||
    `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/getEvaluationArtifact`;

// Base instance for Axios using relative paths
export const api = axios.create({
    baseURL: "",
    headers: {
        "Content-Type": "application/json",
    },
});

export const pingServer = async (): Promise<boolean> => {
    try {
        const response = await api.get("/api/ping");
        return response.data.status === "ok";
    } catch {
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

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const VALID_HASH_RE = /^[a-f0-9]{12}$/;

/**
 * Extracts a 12-char hex evaluation hash from either a bare hash or a Firebase storage URL.
 */
function extractEvalHash(input: string): string | null {
    if (VALID_HASH_RE.test(input)) {
        return input;
    }
    const match =
        input.match(/plots(?:%2f|\/)([a-f0-9]{12})\.json/i) ||
        input.match(/eval_([a-f0-9]{12})\.json/i);
    return match ? match[1] : null;
}

/**
 * Fetches the zero-shot interactive evaluation JSON via the rate-limited Storage proxy.
 */
export const evaluationArtifactUrl = (evalHash: string): string => {
    const hash = evalHash.trim().toLowerCase();
    if (!VALID_HASH_RE.test(hash)) {
        throw new Error("Invalid evaluation hash.");
    }
    return `${ARTIFACT_PROXY_BASE_URL}?category=plots&hash=${hash}`;
};

export const fetchCloudEvaluationJson = async (
    evalUrlOrHash: string,
): Promise<InteractiveEvalData> => {
    const hash = extractEvalHash(evalUrlOrHash);
    const targetUrl = hash ? evaluationArtifactUrl(hash) : evalUrlOrHash;

    const response = await axios.get<InteractiveEvalData>(targetUrl);
    return response.data;
};

interface EvaluationSource {
    isLocal: boolean;
    isShared: boolean;
    serverIsConnected: boolean;
    evalUrl?: string;
}

const requestErrorMessage = (error: unknown): string => {
    if (error && typeof error === "object") {
        const candidate = error as {
            message?: unknown;
            response?: { data?: { message?: unknown } };
        };
        // Prefer the backend's diagnostic over Axios' generic HTTP status text.
        const responseMessage = candidate.response?.data?.message;
        if (typeof responseMessage === "string") return responseMessage;
        if (typeof candidate.message === "string") return candidate.message;
    }
    return error instanceof Error ? error.message : "Unknown request error.";
};

/**
 * Load an evaluation from the local Julia API when possible. If the entry is also
 * published, fall back to the Cloud Function when the local copy is absent/stale.
 */
export const fetchEvaluationJson = async (
    evalHash: string,
    solverType: string,
    source: EvaluationSource,
): Promise<InteractiveEvalData> => {
    let localError: string | null = null;

    if (source.isLocal && source.serverIsConnected) {
        try {
            const response = await fetchEvaluationPlot(evalHash, solverType);
            if (response.status === "success" && response.eval_data) {
                return response.eval_data;
            }
            localError =
                response.message || "Local evaluation JSON was not returned.";
        } catch (error) {
            localError = requestErrorMessage(error);
        }
    } else if (source.isLocal) {
        localError = "The Julia server is not connected.";
    }

    if (source.isShared) {
        try {
            return await fetchCloudEvaluationJson(source.evalUrl || evalHash);
        } catch (error) {
            const cloudError = requestErrorMessage(error);
            throw new Error(
                localError
                    ? `Local evaluation unavailable (${localError}); cloud fallback failed (${cloudError}).`
                    : `Cloud evaluation unavailable (${cloudError}).`,
            );
        }
    }

    throw new Error(
        localError ||
            "This evaluation is not available in the local workspace or the shared cloud registry.",
    );
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
        if (error.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error(
            "Failed to connect to the server to share the experiment.",
        );
    }
};

/**
 * Recursively strips prototype-pollution keys from untrusted JSON objects.
 */
function sanitizeObject(val: any): any {
    if (val === null || typeof val !== "object") {
        return val;
    }
    if (Array.isArray(val)) {
        return val.map(sanitizeObject);
    }
    const result: Record<string, any> = Object.create(null);
    for (const key of Object.keys(val)) {
        if (!DANGEROUS_KEYS.has(key)) {
            result[key] = sanitizeObject(val[key]);
        }
    }
    return result;
}

/**
 * Fetches shared experiments via the rate-limited Firebase Cloud Function proxy.
 */
export const fetchSharedRegistry = async (): Promise<RegistryData> => {
    try {
        const response = await axios.get(SHARED_REGISTRY_PROXY_URL, {
            params: { _t: Date.now() },
        });
        const documents = response.data?.documents || [];

        const sharedRegistry: RegistryData = {
            data: {},
            models: {},
            evaluations: {},
        };

        documents.forEach((rawDoc: any) => {
            const parsedDoc = sanitizeObject(rawDoc);
            if (!parsedDoc || !parsedDoc.hashes) return;

            const dataHash = String(parsedDoc.hashes.data_hash || "");
            const modelHash = String(parsedDoc.hashes.model_hash || "");
            const evalHash = String(parsedDoc.hashes.eval_hash || "");

            // Validate 12-character hex hashes before populating registry
            if (
                !VALID_HASH_RE.test(dataHash) ||
                !VALID_HASH_RE.test(modelHash) ||
                !VALID_HASH_RE.test(evalHash)
            ) {
                return;
            }

            // Reconstruct the nested structure
            sharedRegistry.data[dataHash] = {
                ...parsedDoc.fem_config,
                data_url: parsedDoc.data_url,
                _isShared: true, // Metadata flag for UI
            };

            sharedRegistry.models[modelHash] = {
                solver_type: parsedDoc.model_type,
                solver: parsedDoc.solver_config,
                data_hash: dataHash,
                model_url: parsedDoc.model_url,
                _isShared: true,
            };

            sharedRegistry.evaluations[evalHash] = {
                model_hash: modelHash,
                eval_config: parsedDoc.eval_config,
                benchmark_version: parsedDoc.benchmark_version,
                eval_url: parsedDoc.eval_url,
                _isShared: true,
            };
        });

        return sharedRegistry;
    } catch (error: any) {
        if (error.response?.status === 429) {
            console.warn(
                "Rate limit exceeded while fetching shared registry. Please wait before refreshing.",
            );
        } else {
            console.error(
                "Failed to fetch shared registry from proxy endpoint",
                error,
            );
        }
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
