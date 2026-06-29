import { useFormContext } from "react-hook-form";
import { Activity } from "lucide-react";
import type { SimulationFormValues } from "../../schemas/simulation";

interface Props {
    isLoading: boolean;
}

export default function FEMConfig({ isLoading }: Props) {
    const { register } = useFormContext<SimulationFormValues>();

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 h-full">
            <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Activity size={20} className="text-emerald-600" />
                FEM Generation (1D Transport)
            </h2>

            <div className="grid grid-cols-2 gap-4">
                {/* Beta Parameter Space */}
                <div className="col-span-2 bg-white p-3 rounded shadow-sm border border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                        Parameter Space (Beta)
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                Start
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                disabled={isLoading}
                                {...register("beta_start", {
                                    valueAsNumber: true,
                                })}
                                className="mt-1 w-full p-2 text-sm border rounded bg-slate-50 disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                End
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                disabled={isLoading}
                                {...register("beta_end", {
                                    valueAsNumber: true,
                                })}
                                className="mt-1 w-full p-2 text-sm border rounded bg-slate-50 disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                Step
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                disabled={isLoading}
                                {...register("beta_step", {
                                    valueAsNumber: true,
                                })}
                                className="mt-1 w-full p-2 text-sm border rounded bg-slate-50 disabled:opacity-50"
                            />
                        </div>
                    </div>
                </div>

                {/* Mesh & Time */}
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        Domain L
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        disabled={isLoading}
                        {...register("L", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        nx (Partitions)
                    </label>
                    <input
                        type="number"
                        disabled={isLoading}
                        {...register("nx", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        FEM Order
                    </label>
                    <input
                        type="number"
                        disabled={isLoading}
                        {...register("order", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        Advection (c)
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        disabled={isLoading}
                        {...register("c", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        dt
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        disabled={isLoading}
                        {...register("dt", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        tf (Final Time)
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        disabled={isLoading}
                        {...register("tf", { valueAsNumber: true })}
                        className="mt-1 w-full p-2 text-sm border rounded disabled:opacity-50"
                    />
                </div>
            </div>
        </div>
    );
}
