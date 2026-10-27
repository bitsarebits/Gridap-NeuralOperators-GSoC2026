import { useEffect, useState, useMemo } from "react";
import type { ArenaCandidate, InteractiveEvalData } from "../../types";
import { fetchCloudEvaluationJson, fetchEvaluationPlot } from "../../api";
import PlotlyChart from "../ui/PlotlyChart";
import {
    X,
    Trophy,
    Loader2,
    AlertCircle,
    Activity,
    ScatterChart,
    Play,
    Pause,
} from "lucide-react";

interface Props {
    candidates: ArenaCandidate[];
    onClose: () => void;
}

const MODEL_COLORS = [
    "#2563eb", // blue
    "#9333ea", // purple
    "#059669", // emerald
    "#dc2626", // red
    "#0891b2", // cyan
    "#d97706", // amber
];

export default function ArenaComparisonModal({ candidates, onClose }: Props) {
    const [loadedEvals, setLoadedEvals] = useState<InteractiveEvalData[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [activeView, setActiveView] = useState<"overlay" | "pareto">(
        "overlay",
    );
    const [masterIdx, setMasterIdx] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);

    // Keep the dashboard behind the modal from scrolling. Restore the exact prior
    // values on close so this does not affect the rest of the application.
    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousDocumentOverflow =
            document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousDocumentOverflow;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadAll = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const results: InteractiveEvalData[] = [];
                for (const c of candidates) {
                    if (c.isLocal) {
                        const res = await fetchEvaluationPlot(
                            c.evalHash,
                            c.solverType,
                        );
                        if (res.eval_data) {
                            results.push(res.eval_data);
                        }
                    } else if (c.evalUrl) {
                        const data = await fetchCloudEvaluationJson(c.evalUrl);
                        results.push(data);
                    }
                }
                if (isMounted) {
                    if (
                        results.length === 0 ||
                        results.length !== candidates.length
                    ) {
                        setLoadedEvals([]);
                        setError(
                            "Every selected evaluation must contain interactive JSON data. Re-run legacy PNG evaluations with the current benchmark protocol before comparing them.",
                        );
                    } else if (
                        results.some((ev) => ev.benchmark_version !== 2)
                    ) {
                        setLoadedEvals([]);
                        setError(
                            "These results were generated with an older benchmark protocol. Re-run the selected evaluations before comparing them.",
                        );
                    } else {
                        const reference = results[0];
                        const referenceSigma = Number(
                            reference.metrics?.sigma_test,
                        );
                        const incompatible = results.some((ev) => {
                            const sigma = Number(ev.metrics?.sigma_test);
                            return (
                                !reference.data_hash ||
                                !ev.data_hash ||
                                ev.data_hash !== reference.data_hash ||
                                !Number.isFinite(referenceSigma) ||
                                !Number.isFinite(sigma) ||
                                Math.abs(sigma - referenceSigma) > 1e-12
                            );
                        });

                        if (incompatible) {
                            setLoadedEvals([]);
                            setError(
                                "Arena comparison requires evaluations from the same FEM dataset and the same σ_test. Change the selection and try again.",
                            );
                        } else {
                            setLoadedEvals(results);
                        }
                    }
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(
                        err.message ||
                            "Failed to load evaluations for Arena comparison.",
                    );
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        loadAll();
        return () => {
            isMounted = false;
        };
    }, [candidates]);

    // Use the finest temporal grid among loaded evaluations as the master timeline
    const masterTGrid = useMemo(() => {
        if (loadedEvals.length === 0) return [0];
        let longest = loadedEvals[0].t_grid;
        for (const ev of loadedEvals) {
            if (ev.t_grid.length > longest.length) {
                longest = ev.t_grid;
            }
        }
        return longest;
    }, [loadedEvals]);

    useEffect(() => {
        if (!isPlaying || masterTGrid.length <= 1) return;
        const timer = setInterval(() => {
            setMasterIdx((prev) => (prev + 1) % masterTGrid.length);
        }, 75);
        return () => clearInterval(timer);
    }, [isPlaying, masterTGrid.length]);

    const currentPhysicalTime = masterTGrid[masterIdx] ?? 0;

    // Helper: find closest time index in a model's t_grid for a given physical time
    const findClosestTIdx = (tGrid: number[], targetT: number) => {
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < tGrid.length; i++) {
            const diff = Math.abs(tGrid[i] - targetT);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
            }
        }
        return bestIdx;
    };

    const overlayTraces = useMemo<Plotly.Data[]>(() => {
        if (loadedEvals.length === 0) return [];
        const traces: Plotly.Data[] = [];

        // Reference High-Fidelity FEM from first evaluation
        const refEval = loadedEvals[0];
        const refTIdx = findClosestTIdx(refEval.t_grid, currentPhysicalTime);

        traces.push({
            x: refEval.x_grid,
            y: refEval.u_true[refTIdx],
            type: "scattergl",
            mode: "lines",
            name: "High-Fidelity FEM",
            line: { color: "#f97316", width: 3.5 },
            xaxis: "x",
            yaxis: "y",
        });

        loadedEvals.forEach((ev, idx) => {
            const color = MODEL_COLORS[idx % MODEL_COLORS.length];
            const k = findClosestTIdx(ev.t_grid, currentPhysicalTime);
            const label = `${ev.solver_name} [${ev.eval_hash.slice(0, 6)}]`;

            const absErr = ev.u_pred[k].map((v, i) =>
                Math.abs(v - ev.u_true[k][i]),
            );

            traces.push({
                x: ev.x_grid,
                y: ev.u_pred[k],
                type: "scattergl",
                mode: "lines",
                name: label,
                line: { color, width: 2.5, dash: "dash" },
                xaxis: "x",
                yaxis: "y",
            });

            traces.push({
                x: ev.x_grid,
                y: absErr,
                type: "scattergl",
                mode: "lines",
                name: `|Error| ${label}`,
                line: { color, width: 2 },
                xaxis: "x",
                yaxis: "y2",
                showlegend: false,
            });
        });

        return traces;
    }, [loadedEvals, currentPhysicalTime]);

    // Minimize both inference time and mean relative L2 error. A point is
    // Pareto-optimal if no other point is at least as good on both axes and
    // strictly better on one of them.
    const paretoTraces = useMemo<Plotly.Data[]>(() => {
        const points = loadedEvals
            .map((ev, idx) => ({
                ev,
                idx,
                timeMs: Number(ev.metrics.t_nn) * 1000,
                error: Number(ev.metrics.mean_rel_l2),
            }))
            .filter(
                (p) =>
                    Number.isFinite(p.timeMs) &&
                    p.timeMs >= 0 &&
                    Number.isFinite(p.error) &&
                    p.error >= 0,
            );

        const frontier = points
            .filter(
                (point) =>
                    !points.some(
                        (other) =>
                            other.idx !== point.idx &&
                            other.timeMs <= point.timeMs &&
                            other.error <= point.error &&
                            (other.timeMs < point.timeMs ||
                                other.error < point.error),
                    ),
            )
            .sort((a, b) => a.timeMs - b.timeMs || a.error - b.error);

        const traces: Plotly.Data[] = [];
        if (frontier.length > 1) {
            traces.push({
                x: frontier.map((p) => p.timeMs),
                y: frontier.map((p) => p.error),
                type: "scatter",
                mode: "lines",
                name: "Pareto frontier",
                line: { color: "#0f172a", width: 2, dash: "dot" },
                hoverinfo: "skip",
            });
        }

        points.forEach((point) => {
            const { ev, idx, timeMs, error } = point;
            const isParetoOptimal = frontier.some((p) => p.idx === idx);
            traces.push({
                x: [timeMs],
                y: [error],
                type: "scatter",
                mode: "markers+text",
                name: `${ev.solver_name} (${ev.eval_hash.slice(0, 6)})`,
                text: [`${ev.solver_name} (${ev.metrics.speedup}x)`],
                textposition: "top center",
                marker: {
                    color: MODEL_COLORS[idx % MODEL_COLORS.length],
                    size: isParetoOptimal ? 18 : 12,
                    symbol: isParetoOptimal ? "star" : "circle",
                    line: { color: "#ffffff", width: 2 },
                },
                hovertemplate:
                    `<b>${ev.solver_name} [${ev.eval_hash.slice(0, 6)}]</b><br>` +
                    "Inference Time: %{x:.3f} ms<br>" +
                    "Mean Rel. L₂ Error: %{y:.4f}%<br>" +
                    `Speedup: ${ev.metrics.speedup}x<br>` +
                    `Pareto optimal: ${isParetoOptimal ? "Yes" : "No"}<extra></extra>`,
            });
        });

        return traces;
    }, [loadedEvals]);

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden overscroll-contain">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="arena-modal-title"
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[92dvh] max-h-[92vh] min-h-0 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Modal Header */}
                <div className="shrink-0 px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                            <Trophy size={22} />
                        </div>
                        <div>
                            <h2
                                id="arena-modal-title"
                                className="text-lg font-extrabold"
                            >
                                Neural Operator Benchmark Arena
                            </h2>
                            <p className="text-xs text-slate-400">
                                Comparing {loadedEvals.length} models
                                side-by-side
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-6">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
                            <Loader2
                                size={36}
                                className="animate-spin text-blue-600"
                            />
                            <p className="text-sm font-semibold">
                                Loading spatio-temporal tensors into the
                                Arena...
                            </p>
                        </div>
                    ) : error ? (
                        <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                            <AlertCircle size={20} className="shrink-0" />
                            <span className="text-sm font-medium">{error}</span>
                        </div>
                    ) : (
                        <>
                            {/* View Switcher */}
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setActiveView("overlay")}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            activeView === "overlay"
                                                ? "bg-white text-blue-700 shadow-xs"
                                                : "text-slate-600 hover:text-slate-900"
                                        }`}
                                    >
                                        <Activity size={15} />
                                        Multi-Model Wave Overlay
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveView("pareto")}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            activeView === "pareto"
                                                ? "bg-white text-blue-700 shadow-xs"
                                                : "text-slate-600 hover:text-slate-900"
                                        }`}
                                    >
                                        <ScatterChart size={15} />
                                        Pareto Frontier (Speed vs Accuracy)
                                    </button>
                                </div>
                            </div>

                            {activeView === "overlay" ? (
                                <div className="flex flex-col gap-4">
                                    <div className="h-115 border border-slate-200 rounded-xl p-2 bg-white">
                                        <PlotlyChart
                                            data={overlayTraces}
                                            layout={{
                                                grid: {
                                                    rows: 2,
                                                    columns: 1,
                                                    subplots: ["xy", "xy2"],
                                                },
                                                margin: {
                                                    l: 65,
                                                    r: 25,
                                                    t: 30,
                                                    b: 45,
                                                },
                                                hovermode: "x unified",
                                                legend: {
                                                    orientation: "h",
                                                    y: 1.08,
                                                    x: 0,
                                                },
                                                xaxis: {
                                                    title: {
                                                        text: "Spatial Coordinate (x)",
                                                    },
                                                    anchor: "y2",
                                                    showspikes: true,
                                                    spikemode: "across",
                                                    spikesnap: "cursor",
                                                },
                                                yaxis: {
                                                    title: { text: "u(x, t)" },
                                                    domain: [0.42, 1],
                                                },
                                                yaxis2: {
                                                    title: {
                                                        text: "|u_model - u_HF|",
                                                    },
                                                    domain: [0, 0.34],
                                                    exponentformat: "e",
                                                },
                                            }}
                                        />
                                    </div>

                                    {/* Master Time Scrubber */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsPlaying(!isPlaying)
                                            }
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                                        >
                                            {isPlaying ? (
                                                <>
                                                    <Pause size={14} /> Pause
                                                </>
                                            ) : (
                                                <>
                                                    <Play
                                                        size={14}
                                                        fill="currentColor"
                                                    />{" "}
                                                    Play
                                                </>
                                            )}
                                        </button>
                                        <input
                                            type="range"
                                            min={0}
                                            max={masterTGrid.length - 1}
                                            value={masterIdx}
                                            onChange={(e) => {
                                                setIsPlaying(false);
                                                setMasterIdx(
                                                    Number(e.target.value),
                                                );
                                            }}
                                            className="flex-1 accent-blue-600 cursor-pointer"
                                        />
                                        <span className="font-mono text-xs font-bold bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                                            t = {currentPhysicalTime.toFixed(3)}
                                            s
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-105 border border-slate-200 rounded-xl p-4 bg-white">
                                    <PlotlyChart
                                        data={paretoTraces}
                                        layout={{
                                            title: {
                                                text: "Accuracy vs. Inference Time (Bottom-Left is Optimal)",
                                                font: { size: 14 },
                                            },
                                            margin: {
                                                l: 70,
                                                r: 40,
                                                t: 50,
                                                b: 55,
                                            },
                                            xaxis: {
                                                title: {
                                                    text: "Neural Operator Inference Time (ms)",
                                                },
                                                gridcolor: "#f1f5f9",
                                            },
                                            yaxis: {
                                                title: {
                                                    text: "Mean Relative L₂ Error (%)",
                                                },
                                                gridcolor: "#f1f5f9",
                                            },
                                        }}
                                    />
                                </div>
                            )}

                            {/* Summary Leaderboard Table */}
                            <div className="shrink-0 overflow-x-auto border border-slate-200 rounded-xl">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                            <th className="p-3">Model</th>
                                            <th className="p-3">Eval Hash</th>
                                            <th className="p-3">σ_test</th>
                                            <th className="p-3">Speedup</th>
                                            <th className="p-3">
                                                Inference (ms)
                                            </th>
                                            <th className="p-3">
                                                Mean Rel L₂ (%)
                                            </th>
                                            <th className="p-3">
                                                Peak Rel L₂ (%)
                                            </th>
                                            <th className="p-3">Max |Error|</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-mono">
                                        {loadedEvals.map((ev, i) => (
                                            <tr
                                                key={ev.eval_hash}
                                                className="hover:bg-slate-50"
                                            >
                                                <td className="p-3 font-sans font-bold flex items-center gap-2">
                                                    <span
                                                        className="w-3 h-3 rounded-full inline-block"
                                                        style={{
                                                            backgroundColor:
                                                                MODEL_COLORS[
                                                                    i %
                                                                        MODEL_COLORS.length
                                                                ],
                                                        }}
                                                    />
                                                    {ev.solver_name}
                                                </td>
                                                <td className="p-3 text-slate-500">
                                                    {ev.eval_hash}
                                                </td>
                                                <td className="p-3">
                                                    {ev.metrics.sigma_test}
                                                </td>
                                                <td className="p-3 font-bold text-emerald-700">
                                                    {ev.metrics.speedup}x
                                                </td>
                                                <td className="p-3">
                                                    {(
                                                        ev.metrics.t_nn * 1000
                                                    ).toFixed(2)}{" "}
                                                    ms
                                                </td>
                                                <td className="p-3 font-bold text-blue-700">
                                                    {ev.metrics.mean_rel_l2.toFixed(
                                                        2,
                                                    )}
                                                    %
                                                </td>
                                                <td className="p-3 text-amber-700">
                                                    {ev.metrics.max_rel_l2.toFixed(
                                                        2,
                                                    )}
                                                    %
                                                </td>
                                                <td className="p-3">
                                                    {ev.metrics.linf_error.toExponential(
                                                        2,
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
