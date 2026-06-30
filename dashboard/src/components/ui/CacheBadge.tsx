import { Loader2, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CacheBadgeProps {
    exists?: boolean;
    isChecking: boolean;
    label: string;
    icon: LucideIcon;
}

export default function CacheBadge({
    exists,
    isChecking,
    label,
    icon: Icon,
}: CacheBadgeProps) {
    // Determinate state
    let state: "exists" | "missing" | "loading" | "idle" = "idle";
    if (isChecking) state = "loading";
    else if (exists === true) state = "exists";
    else if (exists === false) state = "missing";

    // Determinate styles and icons
    let style = "bg-slate-100 text-slate-400 border border-slate-200";
    let StatusIcon = CircleDashed;

    if (state === "loading") {
        style = "bg-blue-50 text-blue-600 border border-blue-200 animate-pulse";
        StatusIcon = Loader2;
    } else if (state === "exists") {
        style = "bg-emerald-100 text-emerald-700 border border-emerald-200";
        StatusIcon = CheckCircle2;
    } else if (state === "missing") {
        style = "bg-rose-50 text-rose-600 border border-rose-200";
        StatusIcon = XCircle;
    }

    return (
        <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${style}`}
        >
            <Icon size={14} />
            <span>{label}</span>
            <StatusIcon
                size={14}
                className={state === "loading" ? "animate-spin ml-1" : "ml-1"}
            />
        </div>
    );
}
