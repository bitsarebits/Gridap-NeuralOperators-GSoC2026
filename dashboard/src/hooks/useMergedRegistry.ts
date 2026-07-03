import { useQuery } from "@tanstack/react-query";
import { fetchRegistry, fetchSharedRegistry } from "../api";
import type { RegistryData } from "../types";

/**
 * Merges local and shared registries, prioritizing local data but preserving the shared flag.
 */
const mergeRegistries = (
    local: RegistryData,
    shared: RegistryData,
): RegistryData => {
    const merged: RegistryData = { data: {}, models: {}, evaluations: {} };

    // Helper to merge specific categories
    const mergeCategory = (category: keyof RegistryData) => {
        // First, load everything from shared
        Object.keys(shared[category]).forEach((hash) => {
            merged[category][hash] = { ...shared[category][hash] };
        });

        // Then, overwrite with local but retain/set the _isShared flag if it was in remote
        Object.keys(local[category]).forEach((hash) => {
            const isAlsoShared = !!shared[category][hash];
            merged[category][hash] = {
                ...local[category][hash],
                _isShared: isAlsoShared,
                _isLocal: true, // Metadata to distinguish local presence
            };
        });
    };

    mergeCategory("data");
    mergeCategory("models");
    mergeCategory("evaluations");

    return merged;
};

export const useMergedRegistry = () => {
    return useQuery({
        queryKey: ["registry", "merged"],
        queryFn: async () => {
            const [localRes, sharedData] = await Promise.allSettled([
                fetchRegistry(),
                fetchSharedRegistry(),
            ]);

            const localData =
                localRes.status === "fulfilled" &&
                localRes.value.status === "success"
                    ? localRes.value.data || {
                          data: {},
                          models: {},
                          evaluations: {},
                      }
                    : { data: {}, models: {}, evaluations: {} };

            const remoteData =
                sharedData.status === "fulfilled"
                    ? sharedData.value
                    : { data: {}, models: {}, evaluations: {} };

            return mergeRegistries(localData, remoteData);
        },
        refetchOnWindowFocus: true,
        staleTime: 1000 * 60 * 5, // 5 minutes cache
    });
};
