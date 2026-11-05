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

export interface LossPoint {
    epoch: number;
    loss: number;
}

export interface EvaluationMetrics {
    t_fem: number;
    t_nn: number;
    speedup: number;
    mean_rel_l2: number;
    max_rel_l2: number;
    worst_t_idx: number;
    linf_error: number;
    nx: number;
    nt: number;
    sigma_test: number;
}

export interface InteractiveEvalData {
    benchmark_version: number;
    eval_hash: string;
    model_hash: string;
    data_hash: string;
    solver_name: string;
    x_grid: number[];
    t_grid: number[];
    u_true: number[][]; // Indexed as u_true[tIdx][xIdx]
    u_pred: number[][]; // Indexed as u_pred[tIdx][xIdx]
    rel_l2_t: number[];
    linf_t: number[];
    loss_history: LossPoint[];
    metrics: EvaluationMetrics;
}

export interface ArenaCandidate {
    evalHash: string;
    modelHash: string;
    dataHash: string;
    solverType: string;
    sigmaTest: number | string;
    evalUrl?: string;
    isLocal: boolean;
    isShared: boolean;
    serverIsConnected: boolean;
}

// Julia Response
export interface SimulationResponse {
    data_hash: string;
    model_hash: string;
    eval_hash: string;
    eval_data: InteractiveEvalData;
}

export interface CacheCheckResponse {
    status: "success" | "error";
    message?: string;
    data_exists: boolean;
    model_exists: boolean;
    eval_exists: boolean;
}

export interface RegistryData {
    data: Record<string, any>;
    models: Record<string, any>;
    evaluations: Record<string, any>;
}

export interface RegistryResponse {
    status: "success" | "error";
    data?: RegistryData;
    message?: string;
}

export interface PlotResponse {
    status: "success" | "error";
    eval_data?: InteractiveEvalData;
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
    };
    fem_config: any;
    solver_config?: any;
    eval_config?: any;
    benchmark_version?: number;
    data_url?: string;
    model_url?: string;
    eval_url?: string;
}
