// Models payloads
export type DeepONetPayload = {
    type: "DeepONet";
    epochs: number;
    step_x: number;
    step_t: number;
    m_sensors: number;
    p_latent: number;
    hidden: number;
};

export type FNOPayload = {
    type: "FNO";
    epochs: number;
    nx_red: number;
    nt_red: number;
    hidden_channels: string;
    modes: string;
};

// Schedulers payloads
export type CosineSchedulerPayload = {
    type: "CosineAnnealing";
    ca_lr_max: number;
    ca_lr_min: number;
};

export type PlateauSchedulerPayload = {
    type: "ReduceLROnPlateau";
    rop_patience: number;
    rop_factor: number;
    rop_min_lr: number;
    rop_start_lr: number;
};

// Final payload sent to Julia
export interface SimulationPayload {
    fem_config: {
        beta_start: number;
        beta_end: number;
        beta_step: number;
        order: number;
        L: number;
        nx: number;
        t0: number;
        dt: number;
        tf: number;
        c: number;
        theta: number;
    };
    eval_config: {
        sigma_test: number;
    };
    solver: DeepONetPayload | FNOPayload;
    scheduler: CosineSchedulerPayload | PlateauSchedulerPayload;
}

// Julia Response
export interface SimulationResponse {
    message?: string;
    data_hash?: string;
    model_hash?: string;
    eval_hash?: string;
    image_url?: string;
}

export interface CacheCheckResponse {
    status: "success" | "error";
    message?: string;
    data_exists: boolean;
    model_exists: boolean;
    eval_exists: boolean;
}

export interface RegistryData {
    data: Record<string, any>; // FEM configurations mapped by data_hash
    models: Record<string, any>; // Model configurations mapped by model_hash
    evaluations: Record<string, any>; // Evaluations mapped by eval_hash
}

export interface RegistryResponse {
    status: "success" | "error";
    data?: RegistryData;
    message?: string;
}

export interface PlotResponse {
    status: "success" | "error";
    image_url?: string;
    message?: string;
}
