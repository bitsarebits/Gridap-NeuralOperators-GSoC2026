import { useFormContext } from "react-hook-form";
import type { SimulationFormValues } from "../../schemas/simulation";

interface Props {
    isLoading: boolean;
}

export default function EvalConfig({ isLoading }: Props) {
    const { register } = useFormContext<SimulationFormValues>();

    return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center mt-6">
            <div>
                <h2 className="text-sm font-bold text-amber-900">
                    Zero-Shot Evaluation
                </h2>
                <p className="text-xs text-amber-700">
                    Test the trained model on an unseen parameter.
                </p>
            </div>
            <div className="w-1/3">
                <label className="block text-xs font-bold text-amber-800">
                    Sigma Test
                </label>
                <input
                    type="number"
                    step="0.01"
                    disabled={isLoading}
                    {...register("sigma_test", { valueAsNumber: true })}
                    className="mt-1 w-full p-2 text-sm border border-amber-300 rounded bg-white disabled:opacity-50"
                />
            </div>
        </div>
    );
}
