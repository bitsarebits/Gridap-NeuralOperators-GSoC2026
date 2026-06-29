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

export const formSchema = z.object({
  model_type: z.enum(["DeepONet", "FNO"]),
  
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

  // Schedulers
  lr_scheduler_type: z.enum(["CosineAnnealing", "ReduceLROnPlateau"]),
  ca_lr_max: z.number().positive().optional(),
  ca_lr_min: z.number().positive().optional(),
  rop_patience: z.number().int().positive().optional(),
  rop_factor: z.number().positive().max(1).optional(),
  rop_min_lr: z.number().positive().optional(),
  rop_start_lr: z.number().positive().optional(),
  
  // DeepONet 
  step_x: z.number().int().positive().optional(),
  step_t: z.number().int().positive().optional(),
  m_sensors: z.number().int().positive().optional(),
  p_latent: z.number().int().positive().optional(),
  hidden: z.number().int().positive().optional(),
  
  // FNO 
  nx_red: z.number().int().positive().optional(),
  nt_red: z.number().int().positive().optional(),
  hidden_channels: z.string().optional(),
  modes: z.string().optional(),
  
  // EvalConfig
  sigma_test: z.number().positive(),
});

export type SimulationFormValues = z.infer<typeof formSchema>;