import { useFormContext } from "react-hook-form";
import { Activity } from "lucide-react";
import type { SimulationFormValues } from "../../schemas/simulation";

interface Props {
    isLoading: boolean;
}

export default function FEMConfig({ isLoading }: Props) {
    const {
        register,
        formState: { errors },
    } = useFormContext<SimulationFormValues>();

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
                                step="any"
                                disabled={isLoading}
                                {...register("beta_start", {
                                    valueAsNumber: true,
                                })}
                                className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.beta_start ? "bg-red-50 border-red-400" : "bg-slate-50 border-slate-200"}`}
                            />
                            {errors.beta_start && (
                                <p className="text-[10px] text-red-600 mt-1 font-semibold">
                                    {errors.beta_start.message}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                End
                            </label>
                            <input
                                type="number"
                                step="any"
                                disabled={isLoading}
                                {...register("beta_end", {
                                    valueAsNumber: true,
                                })}
                                className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.beta_end ? "bg-red-50 border-red-400" : "bg-slate-50 border-slate-200"}`}
                            />
                            {errors.beta_end && (
                                <p className="text-[10px] text-red-600 mt-1 font-semibold">
                                    {errors.beta_end.message}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                Step
                            </label>
                            <input
                                type="number"
                                step="any"
                                disabled={isLoading}
                                {...register("beta_step", {
                                    valueAsNumber: true,
                                })}
                                className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.beta_step ? "bg-red-50 border-red-400" : "bg-slate-50 border-slate-200"}`}
                            />
                            {errors.beta_step && (
                                <p className="text-[10px] text-red-600 mt-1 font-semibold">
                                    {errors.beta_step.message}
                                </p>
                            )}
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
                        step="any"
                        disabled={isLoading}
                        {...register("L", { valueAsNumber: true })}
                        className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.L ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}
                    />
                    {errors.L && (
                        <p className="text-[10px] text-red-600 mt-1 font-semibold">
                            {errors.L.message}
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        nx (Partitions)
                    </label>
                    <input
                        type="number"
                        disabled={isLoading}
                        {...register("nx", { valueAsNumber: true })}
                        className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.nx ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}
                    />
                    {errors.nx && (
                        <p className="text-[10px] text-red-600 mt-1 font-semibold">
                            {errors.nx.message}
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        FEM Order
                    </label>
                    <input
                        type="number"
                        disabled={isLoading}
                        {...register("order", { valueAsNumber: true })}
                        className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.order ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}
                    />
                    {errors.order && (
                        <p className="text-[10px] text-red-600 mt-1 font-semibold">
                            {errors.order.message}
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        Advection (c)
                    </label>
                    <input
                        type="number"
                        step="any"
                        disabled={isLoading}
                        {...register("c", { valueAsNumber: true })}
                        className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.c ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}
                    />
                    {errors.c && (
                        <p className="text-[10px] text-red-600 mt-1 font-semibold">
                            {errors.c.message}
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        dt
                    </label>
                    <input
                        type="number"
                        step="any"
                        disabled={isLoading}
                        {...register("dt", { valueAsNumber: true })}
                        className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.dt ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}
                    />
                    {errors.dt && (
                        <p className="text-[10px] text-red-600 mt-1 font-semibold">
                            {errors.dt.message}
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700">
                        tf (Final Time)
                    </label>
                    <input
                        type="number"
                        step="any"
                        disabled={isLoading}
                        {...register("tf", { valueAsNumber: true })}
                        className={`mt-1 w-full p-2 text-sm border rounded disabled:opacity-50 ${errors.tf ? "bg-red-50 border-red-400" : "bg-white border-slate-200"}`}
                    />
                    {errors.tf && (
                        <p className="text-[10px] text-red-600 mt-1 font-semibold">
                            {errors.tf.message}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
