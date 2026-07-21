import { useMemo, useState } from "react";
import type { RegistryData } from "../types";

export interface RegistryFilters {
    // FEM Config
    beta_start?: number;
    beta_end?: number;
    beta_step?: number;
    order?: number;
    L?: number;
    nx?: number;
    t0?: number;
    dt?: number;
    tf?: number;
    c?: number;
    theta?: number;

    // Model Config
    model_type?: string;
    epochs?: number;
    batch_size?: number;

    // DeepONet & NOMAD
    step_x?: number;
    step_t?: number;
    m_sensors?: number;
    p_latent?: number;
    hidden?: number;

    // FNO
    nx_red?: number;
    nt_red?: number;
    hidden_channels?: string;
    modes?: string;

    // Eval Config
    sigma_test?: number;
    [key: string]: any;
}

export function useRegistryFilter(registry: RegistryData | undefined) {
    const [filters, setFilters] = useState<RegistryFilters>({});

    const filteredRegistry = useMemo(() => {
        if (!registry) return undefined;

        // Get active filters (ignoring undefined, null, or empty strings/NaN)
        const activeKeys = Object.keys(filters).filter(
            (k) =>
                filters[k] !== undefined &&
                filters[k] !== "" &&
                !(typeof filters[k] === "number" && Number.isNaN(filters[k])),
        );

        if (activeKeys.length === 0) return registry;

        const filteredData: Record<string, any> = {};
        const filteredModels: Record<string, any> = {};
        const filteredEvals: Record<string, any> = {};

        // Explicitly map keys to their domains based on Julia structs
        const femKeys = [
            "beta_start",
            "beta_end",
            "beta_step",
            "order",
            "L",
            "nx",
            "t0",
            "dt",
            "tf",
            "c",
            "theta",
        ];
        const evalKeys = ["sigma_test"];
        const activeFemFilters = activeKeys.filter((k) => femKeys.includes(k));
        const activeEvalFilters = activeKeys.filter((k) =>
            evalKeys.includes(k),
        );
        const activeModelFilters = activeKeys.filter(
            (k) => !femKeys.includes(k) && !evalKeys.includes(k),
        );

        // PASS 1: Filter Datasets (Parents)
        Object.entries(registry.data).forEach(([dataHash, dataObj]) => {
            let isMatch = true;
            for (const key of activeFemFilters) {
                if (
                    dataObj[key] !== undefined &&
                    dataObj[key] !== filters[key]
                ) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) filteredData[dataHash] = dataObj;
        });

        // PASS 2: Filter Models (Children)
        Object.entries(registry.models).forEach(([modelHash, modelObj]) => {
            const dataHash = modelObj.data_hash;
            if (!filteredData[dataHash]) return;

            const solverType =
                modelObj.solver_type ||
                (modelObj.model_type ? `${modelObj.model_type}Solver` : "");
            const solverParams = modelObj.solver || modelObj;

            let isMatch = true;
            for (const key of activeModelFilters) {
                if (key === "model_type") {
                    if (!solverType.includes(filters[key])) isMatch = false;
                } else if (key === "epochs") {
                    const ep = solverParams.epochs || solverParams.n_epochs;
                    if (ep !== filters[key]) isMatch = false;
                } else if (key === "hidden_channels" || key === "modes") {
                    // String/Tuple fields: clean whitespaces and check inclusion
                    const paramVal = Array.isArray(solverParams[key])
                        ? solverParams[key].join(",")
                        : typeof solverParams[key] === "object" &&
                            solverParams[key] !== null
                          ? Object.values(solverParams[key]).join(",")
                          : String(solverParams[key] || "");

                    const filterVal = String(filters[key]).replace(/\s+/g, "");
                    const cleanParamVal = paramVal.replace(/\s+/g, "");

                    if (!cleanParamVal.includes(filterVal)) isMatch = false;
                } else {
                    if (
                        solverParams[key] !== undefined &&
                        solverParams[key] !== filters[key]
                    ) {
                        isMatch = false;
                    }
                }
            }
            if (isMatch) filteredModels[modelHash] = modelObj;
        });

        // PASS 3: Filter Evaluations (Grandchildren)
        Object.entries(registry.evaluations).forEach(([evalHash, evalObj]) => {
            const modelHash = evalObj.model_hash;
            if (!filteredModels[modelHash]) return;

            const evalConfig = evalObj.eval_config || evalObj;
            let isMatch = true;
            for (const key of activeEvalFilters) {
                if (
                    evalConfig[key] !== undefined &&
                    evalConfig[key] !== filters[key]
                ) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) filteredEvals[evalHash] = evalObj;
        });

        // PASS 4: Bottom-Up Pruning
        if (activeEvalFilters.length > 0) {
            const modelsWithEvals = new Set(
                Object.values(filteredEvals).map((e) => e.model_hash),
            );
            Object.keys(filteredModels).forEach((mHash) => {
                if (!modelsWithEvals.has(mHash)) delete filteredModels[mHash];
            });
        }

        if (activeModelFilters.length > 0 || activeEvalFilters.length > 0) {
            const dataHashesWithModels = new Set(
                Object.values(filteredModels).map((m) => m.data_hash),
            );
            Object.keys(filteredData).forEach((dHash) => {
                if (!dataHashesWithModels.has(dHash))
                    delete filteredData[dHash];
            });
        }

        return {
            data: filteredData,
            models: filteredModels,
            evaluations: filteredEvals,
        } as RegistryData;
    }, [registry, filters]);

    const updateFilter = (key: string, value: any) => {
        setFilters((prev) => {
            const newFilters = { ...prev, [key]: value };

            // Clean up architecture-specific filters when switching model_type
            if (key === "model_type") {
                delete newFilters.step_x;
                delete newFilters.step_t;
                delete newFilters.m_sensors;
                delete newFilters.p_latent;
                delete newFilters.hidden;
                delete newFilters.nx_red;
                delete newFilters.nt_red;
                delete newFilters.modes;
                delete newFilters.hidden_channels;
            }

            if (
                value === "" ||
                value === undefined ||
                (typeof value === "number" && Number.isNaN(value))
            ) {
                delete newFilters[key];
            }
            return newFilters;
        });
    };

    const clearFilters = () => setFilters({});

    return { filters, updateFilter, clearFilters, filteredRegistry };
}
