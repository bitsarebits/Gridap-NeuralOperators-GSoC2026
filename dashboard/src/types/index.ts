// Models payloads
export type DeepONetPayload = {
    type: "DeepONet";
    epochs: number;
    batch_size: number;
    step_x: number;
    step_t: number;
    m_sensors: number;
    p_latent: number;
    hidden: number;
    pretrained_model_hash: string;
};

export type FNOPayload = {
    type: "FNO";
    epochs: number;
    batch_size: number;
    nx_red: number;
    nt_red: number;
    hidden_channels: string;
    modes: string;
    pretrained_model_hash: string;
};

export type NOMADPayload = {
    type: "NOMAD";
    epochs: number;
    batch_size: number;
    step_x: number;
    step_t: number;
    m_sensors: number;
    p_latent: number;
    hidden: number;
    pretrained_model_hash: string;
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
    solver: DeepONetPayload | FNOPayload | NOMADPayload;
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

// Share simulations types (Firebase)

export interface SharePayload {
    eval_hash: string;
}

export interface ShareResponse {
    status: string;
    message: string;
    public_url?: string;
    already_exists?: boolean;
}

export interface SyncPayload {
    eval_hash?: string;
    model_type?: string;
    hashes: {
        data_hash: string;
        model_hash?: string;
        eval_hash?: string;
    };
    fem_config: any;
    solver_config?: any;
    eval_config?: any;
    data_url?: string;
    model_url?: string;
    image_url?: string;
}
