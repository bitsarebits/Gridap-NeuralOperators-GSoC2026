import { Settings2 } from "lucide-react";

interface ConfigGridProps {
    title: string;
    configObj: any;
}

export default function ConfigGrid({ title, configObj }: ConfigGridProps) {
    const flattenObject = (obj: any, prefix = ""): Record<string, string> => {
        return Object.keys(obj).reduce((acc: Record<string, string>, k) => {
            const pre = prefix.length ? prefix + "_" : "";
            if (
                typeof obj[k] === "object" &&
                obj[k] !== null &&
                !Array.isArray(obj[k])
            ) {
                Object.assign(acc, flattenObject(obj[k], pre + k));
            } else if (Array.isArray(obj[k])) {
                acc[pre + k] = `[${obj[k].join(", ")}]`;
            } else {
                const val =
                    typeof obj[k] === "number" && !Number.isInteger(obj[k])
                        ? Number(obj[k].toPrecision(6))
                        : obj[k];
                acc[pre + k] = String(val);
            }
            return acc;
        }, {});
    };

    const flatConfig = flattenObject(configObj);
    const keys = Object.keys(flatConfig).sort();

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-xs">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-3 border-b pb-2">
                <Settings2 size={14} className="text-slate-400" />
                {title}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-3 gap-x-4">
                {keys.map((k) => (
                    <div key={k} className="flex flex-col">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase wrap-break-word">
                            {k}
                        </span>
                        <span className="text-xs font-medium text-slate-800 font-mono">
                            {flatConfig[k]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
