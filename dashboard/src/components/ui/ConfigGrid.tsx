import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";

interface ConfigGridProps {
    title: string;
    configObj: any;
}

// Exported so DatasetNode and ModelNode can reuse the logic
export const FORBIDDEN_KEYS = [
    "_isShared",
    "_isLocal",
    "data_url",
    "model_url",
    "image_url",
    "data_hash",
    "model_hash",
    "eval_hash",
    "solver_type",
    "model_type",
];

const MathSym = ({ children }: { children: ReactNode }) => (
    <span className="normal-case font-serif italic text-slate-700 font-bold text-[12px] ml-1.5 tracking-wider inline-flex items-baseline">
        {children}
    </span>
);

// pedix
const Sub = ({ children }: { children: ReactNode }) => (
    <sub className="text-[7px] font-sans not-italic font-bold ml-px relative top-0.5">
        {children}
    </sub>
);

// Dictionary to map internal JSON keys to human-readable labels
// Using React Fragments and tag <sub> for mathematical formatting
const EXPLICIT_NAMES: Record<string, ReactNode> = {
    beta_start: (
        <>
            Beta Start{" "}
            <MathSym>
                &beta;<Sub>0</Sub>
            </MathSym>
        </>
    ),
    beta_end: (
        <>
            Beta End{" "}
            <MathSym>
                &beta;<Sub>f</Sub>
            </MathSym>
        </>
    ),
    beta_step: (
        <>
            Beta Step <MathSym>&Delta;&beta;</MathSym>
        </>
    ),
    nx: (
        <>
            Spatial Grid Pts{" "}
            <MathSym>
                n<Sub>x</Sub>
            </MathSym>
        </>
    ),
    dt: (
        <>
            Time Step <MathSym>&Delta;t</MathSym>
        </>
    ),
    t0: (
        <>
            Initial Time{" "}
            <MathSym>
                t<Sub>0</Sub>
            </MathSym>
        </>
    ),
    tf: (
        <>
            Final Time{" "}
            <MathSym>
                t<Sub>f</Sub>
            </MathSym>
        </>
    ),
    order: <>FEM Order</>,
    c: (
        <>
            Wave Speed <MathSym>c</MathSym>
        </>
    ),
    theta: (
        <>
            Theta Scheme <MathSym>&theta;</MathSym>
        </>
    ),
    L: (
        <>
            Domain Length <MathSym>L</MathSym>
        </>
    ),
    sigma_test: (
        <>
            Test Parameter <MathSym>&sigma;</MathSym>
        </>
    ),

    hidden: <>Hidden Layer Size</>,
    m_sensors: (
        <>
            Sensors <MathSym>m</MathSym>
        </>
    ),
    p_latent: (
        <>
            Latent Dimension <MathSym>p</MathSym>
        </>
    ),
    step_x: (
        <>
            Spatial Step <MathSym>&Delta;x</MathSym>
        </>
    ),
    step_t: (
        <>
            Temporal Step <MathSym>&Delta;t</MathSym>
        </>
    ),
    epochs: <>Training Epochs</>,
    nx_red: <>Reduced Spatial Grid</>,
    nt_red: <>Reduced Temporal Grid</>,
    modes: <>Fourier Modes</>,
    hidden_channels: <>Hidden Channels</>,
    lr_max: <>Max Learning Rate</>,
    lr_min: <>Min Learning Rate</>,
    max_epochs: <>Scheduler Epochs</>,
    patience: <>Patience</>,
    factor: <>Reduction Factor</>,
};

const LOGICAL_ORDER = [
    // Spacial domain
    "L",
    "nx",
    "step_x",
    "nx_red",
    // Temporal grid
    "t0",
    "tf",
    "dt",
    "step_t",
    "nt_red",
    // PDE
    "c",
    "order",
    "theta",
    // Parameters space
    "beta_start",
    "beta_end",
    "beta_step",
    "sigma_test",
    // Neural Network
    "m_sensors",
    "p_latent",
    "hidden",
    "modes",
    "hidden_channels",
    // Training
    "epochs",
    "max_epochs",
    "lr_max",
    "lr_min",
    "patience",
    "factor",
];

export default function ConfigGrid({ title, configObj }: ConfigGridProps) {
    if (!configObj) return null;

    const cleanConfigObj = Object.fromEntries(
        Object.entries(configObj).filter(
            ([key, _]) => !FORBIDDEN_KEYS.includes(key),
        ),
    );

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

    const formatLabel = (key: string): ReactNode => {
        if (EXPLICIT_NAMES[key]) return EXPLICIT_NAMES[key];

        const matchingKey = Object.keys(EXPLICIT_NAMES).find((k) =>
            key.endsWith(`_${k}`),
        );
        if (matchingKey) return EXPLICIT_NAMES[matchingKey];

        return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    };

    const formatValue = (key: string, val: string): string => {
        // Intercept 'L' or any flattened property ending in '_L'
        if (key === "L" || key.endsWith("_L")) {
            return `[-${val} ; +${val}]`;
        }
        return val;
    };

    const flatConfig = flattenObject(cleanConfigObj);
    const keys = Object.keys(flatConfig);

    const sortedKeys = keys.sort((a, b) => {
        const getRank = (k: string) => {
            const exactIdx = LOGICAL_ORDER.indexOf(k);
            if (exactIdx !== -1) return exactIdx;
            const endingIdx = LOGICAL_ORDER.findIndex((orderKey) =>
                k.endsWith(`_${orderKey}`),
            );
            if (endingIdx !== -1) return endingIdx;
            return 999; // Chiavi non mappate vanno in fondo
        };
        const rankA = getRank(a);
        const rankB = getRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return a.localeCompare(b);
    });

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-xs">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-4 border-b pb-2">
                <Settings2 size={14} className="text-slate-400" />
                {title}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-4 gap-x-4">
                {sortedKeys.map((k) => (
                    <div key={k} className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center flex-wrap">
                            {formatLabel(k)}
                        </span>
                        <span className="text-[13px] font-semibold text-slate-800 font-mono mt-0.5">
                            {formatValue(k, flatConfig[k])}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
