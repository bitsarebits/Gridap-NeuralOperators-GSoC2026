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
    batch_size: 0, // full-batch as default for DeepONet
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
    // DeepONet and NOMAD
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
    pretrained_model_hash: "",
};

// Base number schema with a global required message to satisfy TS type signatures
const reqNum = z.number({ message: "Required" });

const baseSchema = z.object({
    // FEMConfig
    beta_start: reqNum.min(0, "Must be ≥ 0"),
    beta_end: reqNum.min(0, "Must be ≥ 0"),
    beta_step: reqNum.positive("Must be > 0"),
    order: reqNum
        .int("Must be an integer")
        .min(1, "Min order 1")
        .max(5, "Max order 5"),
    L: reqNum.positive("Must be > 0"),
    nx: reqNum.int("Must be an integer").positive("Must be > 0"),
    t0: reqNum.min(0, "Must be ≥ 0"),
    dt: reqNum.positive("Must be > 0"),
    tf: reqNum.positive("Must be > 0"),
    c: reqNum,
    theta: reqNum.min(0, "Must be ≥ 0").max(1, "Must be ≤ 1"),

    // Training
    epochs: reqNum.int("Must be an integer").positive("Must be > 0"),

    // EvalConfig
    sigma_test: reqNum.positive("Must be > 0"),
});

// DeepONet
const deepONetSchema = z.object({
    model_type: z.literal("DeepONet"),
    batch_size: reqNum.int("Must be an integer").min(0, "Must be ≥ 0"),
    step_x: reqNum.int("Must be an integer").positive("Must be > 0"),
    step_t: reqNum.int("Must be an integer").positive("Must be > 0"),
    m_sensors: reqNum.int("Must be an integer").positive("Must be > 0"),
    p_latent: reqNum.int("Must be an integer").positive("Must be > 0"),
    hidden: reqNum.int("Must be an integer").positive("Must be > 0"),
    pretrained_model_hash: z.string(),
});

// FNO
const fnoSchema = z.object({
    model_type: z.literal("FNO"),
    batch_size: reqNum.int("Must be an integer").min(0, "Must be ≥ 0"),
    nx_red: reqNum.int("Must be an integer").positive("Must be > 0"),
    nt_red: reqNum.int("Must be an integer").positive("Must be > 0"),
    hidden_channels: z
        .string()
        .regex(/^[0-9]+(,\s*[0-9]+)*$/, "Format: e.g. 64, 64, 128"),
    modes: z.string().min(1, "Required"),
    pretrained_model_hash: z.string(),
});

// NOMAD
const nomadSchema = z.object({
    model_type: z.literal("NOMAD"),
    batch_size: reqNum.int("Must be an integer").min(0, "Must be ≥ 0"),
    step_x: reqNum.int("Must be an integer").positive("Must be > 0"),
    step_t: reqNum.int("Must be an integer").positive("Must be > 0"),
    m_sensors: reqNum.int("Must be an integer").positive("Must be > 0"),
    p_latent: reqNum.int("Must be an integer").positive("Must be > 0"),
    hidden: reqNum.int("Must be an integer").positive("Must be > 0"),
    pretrained_model_hash: z.string(),
});

const modelUnion = z.discriminatedUnion("model_type", [
    deepONetSchema,
    fnoSchema,
    nomadSchema,
]);

// Schedulers
const cosineSchema = z.object({
    lr_scheduler_type: z.literal("CosineAnnealing"),
    ca_lr_max: reqNum.positive("Must be > 0"),
    ca_lr_min: reqNum.positive("Must be > 0"),
});

const plateauSchema = z.object({
    lr_scheduler_type: z.literal("ReduceLROnPlateau"),
    rop_patience: reqNum.int("Must be an integer").positive("Must be > 0"),
    rop_factor: reqNum.positive("Must be > 0").max(1, "Must be ≤ 1"),
    rop_min_lr: reqNum.positive("Must be > 0"),
    rop_start_lr: reqNum.positive("Must be > 0"),
});

const schedulerUnion = z.discriminatedUnion("lr_scheduler_type", [
    cosineSchema,
    plateauSchema,
]);

export const formSchema = baseSchema.and(modelUnion).and(schedulerUnion);

export type SimulationFormValues = z.infer<typeof formSchema>;
