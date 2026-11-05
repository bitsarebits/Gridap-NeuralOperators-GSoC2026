import {
    onRequest,
    type Request,
    type Response,
} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// Allowed origins matching GitHub Pages and local development servers
const ALLOWED_ORIGINS = new Set<string>([
    "https://bitsarebits.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]);

interface RateLimitRecord {
    count: number;
    resetTime: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterSec: number;
}

// Rate limiting configuration (per IP address)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 20; // Max 20 requests per IP per minute
const MAX_GLOBAL_REQUESTS_PER_WINDOW = 300; // Additional per-instance ceiling across IPs
const MAX_TRACKED_IPS = 10000; // Hard cap to prevent memory exhaustion
const MAX_ARTIFACT_BYTES = 500 * 1024 * 1024;
const MAX_EVALUATION_JSON_BYTES = 20 * 1024 * 1024;
const VALID_HASH_REGEX = /^[a-f0-9]{12}$/;

// Shared in-memory request trackers. maxInstances=1 keeps this ceiling process-wide
// for each deployed function, but it is not a substitute for Cloud Armor/App Check.
const ipRequestStore = new Map<string, RateLimitRecord>();
let globalRequestCount = 0;
let globalRequestResetTime = Date.now() + RATE_LIMIT_WINDOW_MS;

// In-memory cache for the shared experiments catalog
let cachedDocuments: FirebaseFirestore.DocumentData[] | null = null;
let cachedCatalogTimestamp = -1;

// Type of artifacts supported by the storage proxy.
type ArtifactCategory = "plots" | "data" | "models";

// Cache publication-membership checks briefly. The artifact proxy must only serve
// objects referenced by a published gallery document, not arbitrary bucket hashes.
const PUBLICATION_CACHE_TTL_MS = 30 * 1000;
const MAX_PUBLICATION_CACHE_ENTRIES = 10000;
const publicationCache = new Map<
    string,
    { allowed: boolean; expiresAt: number }
>();

function prunePublicationCache(now: number): void {
    if (publicationCache.size < 1000) return;
    for (const [key, entry] of publicationCache.entries()) {
        if (entry.expiresAt <= now) publicationCache.delete(key);
    }
    while (publicationCache.size >= MAX_PUBLICATION_CACHE_ENTRIES) {
        const oldestKey = publicationCache.keys().next().value;
        if (oldestKey === undefined) break;
        publicationCache.delete(oldestKey);
    }
}

async function isPublishedArtifact(
    category: ArtifactCategory,
    hash: string,
): Promise<boolean> {
    const cacheKey = `${category}:${hash}`;
    const now = Date.now();
    prunePublicationCache(now);
    const cached = publicationCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.allowed;

    let allowed = false;
    if (category === "plots") {
        const doc = await db.collection("shared_experiments").doc(hash).get();
        allowed = doc.exists;
    } else {
        const field =
            category === "data" ? "hashes.data_hash" : "hashes.model_hash";
        const snapshot = await db
            .collection("shared_experiments")
            .where(field, "==", hash)
            .limit(1)
            .get();
        allowed = !snapshot.empty;
    }

    // Cache only positive checks: a previously unpublished hash must become
    // readable immediately after a successful publish operation.
    if (allowed) {
        publicationCache.set(cacheKey, {
            allowed: true,
            expiresAt: now + PUBLICATION_CACHE_TTL_MS,
        });
    }
    return allowed;
}

/**
 * Extracts the client IP address safely behind Google Cloud Load Balancers.
 */
function getClientIp(req: Request): string {
    // Express/Firebase resolves the client address using its trusted proxy chain.
    // Do not parse a caller-supplied X-Forwarded-For value manually.
    return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Periodically removes expired IP entries to prevent memory leaks.
 */
function cleanupExpiredIps(now: number): void {
    if (ipRequestStore.size < 1000) return;
    for (const [ip, record] of ipRequestStore.entries()) {
        if (now > record.resetTime) {
            ipRequestStore.delete(ip);
        }
    }
    // Bound memory without clearing every active IP's quota at once.
    while (ipRequestStore.size > MAX_TRACKED_IPS) {
        const oldestIp = ipRequestStore.keys().next().value;
        if (oldestIp === undefined) break;
        ipRequestStore.delete(oldestIp);
    }
}

/**
 * Checks if the requesting IP has exceeded the rate limit.
 */
function checkRateLimit(ip: string): RateLimitResult {
    const now = Date.now();
    cleanupExpiredIps(now);

    if (now >= globalRequestResetTime) {
        globalRequestCount = 0;
        globalRequestResetTime = now + RATE_LIMIT_WINDOW_MS;
    }
    if (globalRequestCount >= MAX_GLOBAL_REQUESTS_PER_WINDOW) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterSec: Math.max(
                1,
                Math.ceil((globalRequestResetTime - now) / 1000),
            ),
        };
    }
    globalRequestCount += 1;

    const record = ipRequestStore.get(ip);

    if (!record || now > record.resetTime) {
        ipRequestStore.set(ip, {
            count: 1,
            resetTime: now + RATE_LIMIT_WINDOW_MS,
        });
        return {
            allowed: true,
            remaining: MAX_REQUESTS_PER_WINDOW - 1,
            retryAfterSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
        };
    }

    if (record.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfterSec = Math.max(
            1,
            Math.ceil((record.resetTime - now) / 1000),
        );
        return {
            allowed: false,
            remaining: 0,
            retryAfterSec,
        };
    }

    record.count += 1;
    return {
        allowed: true,
        remaining: MAX_REQUESTS_PER_WINDOW - record.count,
        retryAfterSec: Math.ceil((record.resetTime - now) / 1000),
    };
}

/**
 * Applies common CORS headers and handles preflight OPTIONS requests.
 */
function handleCors(req: Request, res: Response): boolean {
    const origin = (req.headers.origin as string) || "";
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Max-Age", "3600");
        res.status(204).send("");
        return true;
    }
    return false;
}

/**
 * Cloud Function: getSharedExperiments
 * Returns the cached list of shared experiments from Firestore.
 */
export const getSharedExperiments = onRequest(
    {
        region: "us-central1",
        maxInstances: 1,
        memory: "256MiB",
        timeoutSeconds: 10,
    },
    async (req: Request, res: Response) => {
        if (handleCors(req, res)) return;

        if (req.method !== "GET") {
            res.status(405).json({
                status: "error",
                message: "Method Not Allowed. Use GET.",
            });
            return;
        }

        // Enforce IP-based Rate Limiting
        const clientIp = getClientIp(req);
        const rateStatus = checkRateLimit(clientIp);

        res.set("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
        res.set("X-RateLimit-Remaining", String(rateStatus.remaining));

        if (!rateStatus.allowed) {
            res.set("Retry-After", String(rateStatus.retryAfterSec));
            res.status(429).json({
                status: "error",
                message: `Too many requests. Please try again in ${rateStatus.retryAfterSec} seconds.`,
            });
            return;
        }

        // No browser local cache of the dynamic catalog
        res.set(
            "Cache-Control",
            "private, no-cache, no-store, must-revalidate",
        );
        res.set("Pragma", "no-cache");

        try {
            // Read the metadata document (catalog version)
            const metaDoc = await db
                .collection("catalog_metadata")
                .doc("state")
                .get();
            const currentTimestamp = metaDoc.exists
                ? Number(metaDoc.data()?.updated_at || 0)
                : 0;

            // Cache HIT
            if (
                cachedDocuments !== null &&
                cachedCatalogTimestamp === currentTimestamp
            ) {
                res.set("X-Proxy-Cache", "HIT");
                res.status(200).json({
                    status: "success",
                    documents: cachedDocuments,
                });
                return;
            }

            // Cache MISS
            const snapshot = await db.collection("shared_experiments").get();
            const documents: FirebaseFirestore.DocumentData[] = [];
            snapshot.forEach((doc) => {
                documents.push(doc.data());
            });

            // Update in-memory cache
            cachedDocuments = documents;
            cachedCatalogTimestamp = currentTimestamp;

            res.set("X-Proxy-Cache", "MISS");
            res.status(200).json({ status: "success", documents });
        } catch (error) {
            console.error("Error fetching shared_experiments:", error);
            res.status(500).json({
                status: "error",
                message: "Internal server error.",
            });
        }
    },
);

/**
 * Cloud Function: getEvaluationArtifact
 * Serves zero-shot evaluation JSON directly (plots) OR generates short-lived
 * Signed URLs for binary artifacts (data, models) with rate limiting.
 */
export const getEvaluationArtifact = onRequest(
    {
        region: "us-central1",
        maxInstances: 1,
        memory: "256MiB",
        timeoutSeconds: 15,
    },
    async (req: Request, res: Response) => {
        if (handleCors(req, res)) return;

        if (req.method !== "GET") {
            res.status(405).json({
                status: "error",
                message: "Method Not Allowed. Use GET.",
            });
            return;
        }

        const clientIp = getClientIp(req);
        const rateStatus = checkRateLimit(clientIp);

        res.set("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
        res.set("X-RateLimit-Remaining", String(rateStatus.remaining));

        if (!rateStatus.allowed) {
            res.set("Retry-After", String(rateStatus.retryAfterSec));
            res.status(429).json({
                status: "error",
                message: `Too many requests. Please try again in ${rateStatus.retryAfterSec} seconds.`,
            });
            return;
        }

        // Validate query parameters
        const evalHash = String(req.query.hash || "")
            .trim()
            .toLowerCase();
        const category = String(req.query.category || "plots")
            .trim()
            .toLowerCase() as ArtifactCategory;

        if (!VALID_HASH_REGEX.test(evalHash)) {
            res.status(400).json({
                status: "error",
                message:
                    "Invalid or missing 'hash' query parameter. Expected 12-char hex string.",
            });
            return;
        }

        if (!["plots", "data", "models"].includes(category)) {
            res.status(400).json({
                status: "error",
                message:
                    "Invalid 'category'. Must be 'plots', 'data', or 'models'.",
            });
            return;
        }

        try {
            const published = await isPublishedArtifact(category, evalHash);
            if (!published) {
                res.status(404).json({
                    status: "error",
                    message:
                        "Artifact is not referenced by a published gallery experiment.",
                });
                return;
            }

            const bucket = storage.bucket();
            const ext = category === "plots" ? "json" : "jld2";
            const filePath = `${category}/${evalHash}.${ext}`;
            const file = bucket.file(filePath);

            const [exists] = await file.exists();
            if (!exists) {
                res.status(404).json({
                    status: "error",
                    message: `Artifact '${filePath}' not found.`,
                });
                return;
            }

            const [metadata] = await file.getMetadata();
            const artifactSize = Number(metadata.size || 0);
            const maxSize =
                category === "plots"
                    ? MAX_EVALUATION_JSON_BYTES
                    : MAX_ARTIFACT_BYTES;
            if (
                !Number.isFinite(artifactSize) ||
                artifactSize <= 0 ||
                artifactSize > maxSize
            ) {
                res.status(413).json({
                    status: "error",
                    message: `Artifact '${filePath}' is empty or exceeds the ${maxSize}-byte download limit.`,
                });
                return;
            }

            // Case A: For heavy binary files (data, models), generate a short-lived Signed URL (15 mins)
            if (category === "data" || category === "models") {
                const [signedUrl] = await file.getSignedUrl({
                    version: "v4",
                    action: "read",
                    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
                });

                res.set("Cache-Control", "no-store");
                res.status(200).json({
                    status: "success",
                    signed_url: signedUrl,
                    expires_in_seconds: 900,
                });
                return;
            }

            // Case B: For lightweight plot JSON, stream directly to browser
            const [fileBuffer] = await file.download({ decompress: false });
            if (fileBuffer.byteLength > MAX_EVALUATION_JSON_BYTES) {
                res.status(413).json({
                    status: "error",
                    message:
                        "Evaluation JSON exceeds the maximum allowed size.",
                });
                return;
            }

            const isGzip =
                fileBuffer.length >= 2 &&
                fileBuffer[0] === 0x1f &&
                fileBuffer[1] === 0x8b;

            res.set("Content-Type", "application/json; charset=utf-8");

            if (isGzip) {
                res.set("Content-Encoding", "gzip");
            } else {
                res.removeHeader("Content-Encoding");
            }

            res.status(200).send(fileBuffer);
        } catch (error) {
            console.error(
                `Error processing artifact request for ${category}/${evalHash}:`,
                error,
            );
            res.status(500).json({
                status: "error",
                message:
                    "Internal server error while processing storage artifact.",
            });
        }
    },
);
