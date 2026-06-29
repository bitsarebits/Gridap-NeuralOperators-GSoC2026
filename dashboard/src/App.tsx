import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BrainCircuit, Loader2, Play, AlertCircle } from "lucide-react";

// Schemas & Types
import { formSchema, defaultValues } from "./schemas/simulation";
import type { SimulationFormValues } from "./schemas/simulation";
import type { SimulationPayload, SimulationResponse } from "./types";

// API
import { runSimulation } from "./api";

// Components
import FEMConfig from "./components/forms/FEMConfig";
import ModelConfig from "./components/forms/ModelConfig";
import EvalConfig from "./components/forms/EvalConfig";
import Results from "./components/Results";

function App() {
    // Initialize the form with zod
    const methods = useForm<SimulationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: defaultValues,
    });

    // State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SimulationResponse | null>(null);

    // Submit handler
    const onSubmit = async (data: SimulationFormValues) => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        const payload: SimulationPayload = {
            fem_config: {
                beta_start: data.beta_start,
                beta_end: data.beta_end,
                beta_step: data.beta_step,
                order: data.order,
                L: data.L,
                nx: data.nx,
                t0: data.t0,
                dt: data.dt,
                tf: data.tf,
                c: data.c,
                theta: data.theta,
            },
            eval_config: {
                sigma_test: data.sigma_test,
            },
            solver:
                data.model_type === "DeepONet"
                    ? {
                          type: "DeepONet",
                          epochs: data.epochs,
                          step_x: data.step_x,
                          step_t: data.step_t,
                          m_sensors: data.m_sensors,
                          p_latent: data.p_latent,
                          hidden: data.hidden,
                      }
                    : {
                          type: "FNO",
                          epochs: data.epochs,
                          nx_red: data.nx_red,
                          nt_red: data.nt_red,
                          hidden_channels: data.hidden_channels,
                          modes: data.modes,
                      },

            scheduler:
                data.lr_scheduler_type === "CosineAnnealing"
                    ? {
                          type: "CosineAnnealing",
                          ca_lr_max: data.ca_lr_max,
                          ca_lr_min: data.ca_lr_min,
                      }
                    : {
                          type: "ReduceLROnPlateau",
                          rop_start_lr: data.rop_start_lr,
                          rop_min_lr: data.rop_min_lr,
                          rop_factor: data.rop_factor,
                          rop_patience: data.rop_patience,
                      },
        };

        console.log("Payload sent to Julia:", payload);

        try {
            const response = await runSimulation(payload);

            if (response.status === "success") {
                setResult(response);
            } else {
                setError(
                    response.message || "Simulation failed on the server.",
                );
            }
        } catch (err) {
            console.error(err);
            setError(
                "Failed to connect to the Julia backend. Make sure the server is running on port 8080.",
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-5xl">
                {/* Header */}
                <div className="mb-8 border-b pb-4">
                    <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                        <BrainCircuit className="text-blue-600" size={32} />
                        GridapROMs Orchestrator
                    </h1>
                    <p className="text-slate-500 mt-2">
                        Configure High-Fidelity FEM generation and Neural
                        Operator training parameters.
                    </p>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-center gap-3 rounded-r-lg">
                        <AlertCircle className="text-red-500" />
                        <p className="text-red-700 text-sm font-medium">
                            {error}
                        </p>
                    </div>
                )}

                {/* FormProvider wrapping the form. 
                Allows FEMConfig, ModelConfig ed EvalConfig to use `useFormContext`*/}
                <FormProvider {...methods}>
                    <form
                        onSubmit={methods.handleSubmit(onSubmit)}
                        className="space-y-8"
                    >
                        {/* Grid structure for the sub-components */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* left column */}
                            <FEMConfig isLoading={isLoading} />

                            {/* right column */}
                            <div className="space-y-6 flex flex-col">
                                <ModelConfig isLoading={isLoading} />
                                <EvalConfig isLoading={isLoading} />
                            </div>
                        </div>

                        {/* Submit button */}
                        <div className="border-t pt-6 flex justify-end">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full lg:w-auto font-bold py-4 px-10 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg 
                  ${
                      isLoading
                          ? "bg-slate-400 cursor-not-allowed text-slate-200"
                          : "bg-slate-900 hover:bg-blue-600 text-white hover:shadow-blue-500/30"
                  }`}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2
                                            size={20}
                                            className="animate-spin"
                                        />
                                        Running Pipeline...
                                    </>
                                ) : (
                                    <>
                                        <Play size={20} fill="currentColor" />
                                        Launch Pipeline
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </FormProvider>
            </div>

            {/* Results component */}
            {result && result.eval_hash && result.image_url && !isLoading && (
                <Results
                    plotHash={result.eval_hash}
                    imageUrl={result.image_url}
                />
            )}
        </div>
    );
}

export default App;
