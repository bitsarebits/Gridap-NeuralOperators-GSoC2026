import { z } from "zod";

// Default values
export const defaultValues = {
    model_type: "DeepONet" as const,
    // Data Generation
    beta_start: 1.0,
    beta_end: 2.0,
    beta_step: 0.2,
    order: 3,
    L: 5.0,
    nx: 1000,
    t0: 0.0,
    dt: 0.01,
    tf: 1.0,
    c: 1.0,
    theta: 0.5,
    // Training
    epochs: 20000,
    // LR Scheduler
    lr_scheduler_type: "CosineAnnealing" as const,
    // CosineAnnealing
    ca_lr_max: 0.001,
    ca_lr_min: 0.000001, // 1e-6
    // ReduceLROnPlateau
    rop_patience: 100,
    rop_factor: 0.5,
    rop_min_lr: 0.000001, // 1e-6
    rop_start_lr: 0.001,
    // DeepONet
    step_x: 10,
    step_t: 5,
    m_sensors: 100,
    p_latent: 64,
    hidden: 64,
    // FNO
    nx_red: 256,
    nt_red: 50,
    hidden_channels: "64, 64, 128",
    modes: "32",
    // Test and plot
    sigma_test: 0.03,
};

const baseSchema = z.object({
    // FEMConfig
    beta_start: z.number().min(0),
    beta_end: z.number().min(0),
    beta_step: z.number().positive(),
    order: z.number().int().min(1).max(5),
    L: z.number().positive(),
    nx: z.number().int().positive(),
    t0: z.number().min(0),
    dt: z.number().positive(),
    tf: z.number().positive(),
    c: z.number(),
    theta: z.number().min(0).max(1),

    // Training
    epochs: z.number().int().positive(),

    // EvalConfig
    sigma_test: z.number().positive(),
});

// DeepONet
const deepONetSchema = z.object({
    model_type: z.literal("DeepONet"),
    step_x: z.number().int().positive(),
    step_t: z.number().int().positive(),
    m_sensors: z.number().int().positive(),
    p_latent: z.number().int().positive(),
    hidden: z.number().int().positive(),
});

// FNO
const fnoSchema = z.object({
    model_type: z.literal("FNO"),
    nx_red: z.number().int().positive(),
    nt_red: z.number().int().positive(),
    hidden_channels: z.string().regex(/^[0-9]+(,\s*[0-9]+)*$/), // Validate the format "64, 64, 128"
    modes: z.string(),
});

const modelUnion = z.discriminatedUnion("model_type", [
    deepONetSchema,
    fnoSchema,
]);

// Schedulers
const cosineSchema = z.object({
    lr_scheduler_type: z.literal("CosineAnnealing"),
    ca_lr_max: z.number().positive(),
    ca_lr_min: z.number().positive(),
});

const plateauSchema = z.object({
    lr_scheduler_type: z.literal("ReduceLROnPlateau"),
    rop_patience: z.number().int().positive(),
    rop_factor: z.number().positive().max(1),
    rop_min_lr: z.number().positive(),
    rop_start_lr: z.number().positive(),
});

const schedulerUnion = z.discriminatedUnion("lr_scheduler_type", [
    cosineSchema,
    plateauSchema,
]);

export const formSchema = baseSchema.and(modelUnion).and(schedulerUnion);

export type SimulationFormValues = z.infer<typeof formSchema>;
