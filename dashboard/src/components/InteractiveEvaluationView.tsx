import { useState, useEffect, useMemo, useCallback } from "react";
import type { InteractiveEvalData } from "../types";
import PlotlyChart from "./ui/PlotlyChart";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Zap,
    Target,
    AlertTriangle,
    Grid,
    Activity,
    Layers,
    TrendingDown,
    Download,
    Lock,
    Unlock,
} from "lucide-react";

interface Props {
    evalData: InteractiveEvalData;
    compact?: boolean;
}

export default function InteractiveEvaluationView({
    evalData,
    compact = false,
}: Props) {
    const {
        x_grid,
        t_grid,
        u_true,
        u_pred,
        rel_l2_t,
        linf_t,
        loss_history,
        metrics,
        solver_name,
        eval_hash,
    } = evalData;

    const numSteps = t_grid.length;

    // Interactive State
    const [tIdx, setTIdx] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [activeTab, setActiveTab] = useState<"1d" | "2d" | "loss">("1d");
    const [lockErrorYAxis, setLockErrorYAxis] = useState<boolean>(true);

    // Precompute global bounds for stable axes during playback
    const bounds = useMemo(() => {
        let uMin = Infinity;
        let uMax = -Infinity;
        let errMax = 0;

        for (let k = 0; k < numSteps; k++) {
            const ut = u_true[k];
            const up = u_pred[k];
            for (let i = 0; i < ut.length; i++) {
                if (ut[i] < uMin) uMin = ut[i];
                if (ut[i] > uMax) uMax = ut[i];
                if (up[i] < uMin) uMin = up[i];
                if (up[i] > uMax) uMax = up[i];
                const err = Math.abs(up[i] - ut[i]);
                if (err > errMax) errMax = err;
            }
        }
        const uPad = (uMax - uMin) * 0.08 || 0.1;
        return {
            uRange: [uMin - uPad, uMax + uPad] as [number, number],
            errRange: [0, errMax * 1.08 || 1e-4] as [number, number],
        };
    }, [u_true, u_pred, numSteps]);

    // Precompute 2D error matrix for heatmap
    const absErrorMatrix = useMemo(() => {
        return u_pred.map((upSlice, k) =>
            upSlice.map((val, i) => Math.abs(val - u_true[k][i])),
        );
    }, [u_pred, u_true]);

    // Animation loop for Play/Pause
    useEffect(() => {
        if (!isPlaying) return;
        const intervalMs = Math.max(20, Math.floor(80 / playbackSpeed));
        const timer = setInterval(() => {
            setTIdx((prev) => (prev + 1) % numSteps);
        }, intervalMs);

        return () => clearInterval(timer);
    }, [isPlaying, playbackSpeed, numSteps]);

    // Current frame slices
    const currentT = t_grid[tIdx] ?? 0;
    const currentUTrue = u_true[tIdx] ?? [];
    const currentUPred = u_pred[tIdx] ?? [];
    const currentAbsErr = useMemo(
        () => currentUPred.map((v, i) => Math.abs(v - currentUTrue[i])),
        [currentUPred, currentUTrue],
    );

    // 1D Synchronized Subplots (u_true vs u_pred on top, |e| on bottom)
    const plot1DData = useMemo<Plotly.Data[]>(
        () => [
            {
                x: x_grid,
                y: currentUTrue,
                type: "scattergl",
                mode: "lines",
                name: "High-Fidelity FEM",
                line: { color: "#f97316", width: 3 },
                xaxis: "x",
                yaxis: "y",
                hovertemplate: "FEM: %{y:.5f}<extra></extra>",
            },
            {
                x: x_grid,
                y: currentUPred,
                type: "scattergl",
                mode: "lines",
                name: `${solver_name} (Pred)`,
                line: { color: "#2563eb", width: 3, dash: "dash" },
                xaxis: "x",
                yaxis: "y",
                hovertemplate: `${solver_name}: %{y:.5f}<extra></extra>`,
            },
            {
                x: x_grid,
                y: currentAbsErr,
                type: "scattergl",
                mode: "lines",
                name: "|u_pred - u_HF|",
                fill: "tozeroy",
                fillcolor: "rgba(16, 185, 129, 0.12)",
                line: { color: "#10b981", width: 2.5 },
                xaxis: "x",
                yaxis: "y2",
                hovertemplate: "Abs Error: %{y:.5e}<extra></extra>",
            },
        ],
        [x_grid, currentUTrue, currentUPred, currentAbsErr, solver_name],
    );

    const plot1DLayout = useMemo<Partial<Plotly.Layout>>(
        () => ({
            grid: {
                rows: 2,
                columns: 1,
                subplots: ["xy", "xy2"],
                roworder: "top to bottom",
            },
            margin: { l: 65, r: 25, t: 30, b: 45 },
            hovermode: "x unified",
            legend: {
                orientation: "h",
                yanchor: "bottom",
                y: 1.02,
                xanchor: "left",
                x: 0,
                font: { size: 12 },
            },
            xaxis: {
                title: { text: "Spatial Coordinate (x)", font: { size: 12 } },
                domain: [0, 1],
                anchor: "y2",
                gridcolor: "#f1f5f9",
                zerolinecolor: "#cbd5e1",
                showspikes: true,
                spikemode: "across",
                spikesnap: "cursor",
            },
            yaxis: {
                title: { text: "Solution u(x, t)", font: { size: 12 } },
                domain: [0.42, 1],
                range: bounds.uRange,
                gridcolor: "#f1f5f9",
                zerolinecolor: "#cbd5e1",
            },
            yaxis2: {
                title: { text: "|u_pred - u_HF|", font: { size: 12 } },
                domain: [0, 0.34],
                range: lockErrorYAxis ? bounds.errRange : undefined,
                autorange: !lockErrorYAxis,
                gridcolor: "#f1f5f9",
                zerolinecolor: "#cbd5e1",
                exponentformat: "e",
            },
            paper_bgcolor: "transparent",
            plot_bgcolor: "#ffffff",
        }),
        [bounds, lockErrorYAxis],
    );

    // 2D Spatio-Temporal Heatmaps (Predicted Field & Pointwise Error)
    const plot2DData = useMemo<Plotly.Data[]>(
        () => [
            {
                x: x_grid,
                y: t_grid,
                z: u_pred,
                type: "heatmap",
                colorscale: "Viridis",
                colorbar: {
                    title: { text: "u(x,t)", side: "right" },
                    len: 0.45,
                    y: 0.78,
                },
                xaxis: "x",
                yaxis: "y",
                hovertemplate:
                    "x: %{x:.3f}<br>t: %{y:.3f}s<br>u_pred: %{z:.5f}<extra>Prediction</extra>",
            },
            {
                x: x_grid,
                y: t_grid,
                z: absErrorMatrix,
                type: "heatmap",
                colorscale: "YlOrRd",
                reversescale: true,
                colorbar: {
                    title: { text: "|Error|", side: "right" },
                    len: 0.45,
                    y: 0.22,
                },
                xaxis: "x",
                yaxis: "y2",
                hovertemplate:
                    "x: %{x:.3f}<br>t: %{y:.3f}s<br>|Error|: %{z:.5e}<extra>Abs Error</extra>",
            },
        ],
        [x_grid, t_grid, u_pred, absErrorMatrix],
    );

    const plot2DLayout = useMemo<Partial<Plotly.Layout>>(
        () => ({
            margin: { l: 65, r: 80, t: 30, b: 45 },
            xaxis: {
                title: { text: "Spatial Coordinate (x)", font: { size: 12 } },
                domain: [0, 1],
                anchor: "y2",
            },
            yaxis: {
                title: { text: "Time t (Prediction)", font: { size: 12 } },
                domain: [0.55, 1],
            },
            yaxis2: {
                title: { text: "Time t (|Error|)", font: { size: 12 } },
                domain: [0, 0.45],
            },
            shapes: [
                {
                    type: "line",
                    xref: "paper",
                    yref: "y",
                    x0: 0,
                    x1: 1,
                    y0: currentT,
                    y1: currentT,
                    line: { color: "#ffffff", width: 2, dash: "dot" },
                },
                {
                    type: "line",
                    xref: "paper",
                    yref: "y2",
                    x0: 0,
                    x1: 1,
                    y0: currentT,
                    y1: currentT,
                    line: { color: "#1e293b", width: 2, dash: "dot" },
                },
            ],
            paper_bgcolor: "transparent",
            plot_bgcolor: "#ffffff",
        }),
        [currentT],
    );

    // Temporal Error Strip E(t)
    const errorStripData = useMemo<Plotly.Data[]>(
        () => [
            {
                x: t_grid,
                y: rel_l2_t,
                type: "scatter",
                mode: "lines",
                name: "Rel L2 Error (%)",
                fill: "tozeroy",
                fillcolor: "rgba(245, 158, 11, 0.15)",
                line: { color: "#d97706", width: 2 },
                hovertemplate:
                    "t = %{x:.3f}s | L2 Err = %{y:.2f}%<extra></extra>",
            },
            {
                x: [currentT],
                y: [rel_l2_t[tIdx] ?? 0],
                type: "scatter",
                mode: "markers",
                name: "Current Step",
                marker: {
                    color: "#dc2626",
                    size: 9,
                    line: { color: "#fff", width: 2 },
                },
                hoverinfo: "skip",
            },
        ],
        [t_grid, rel_l2_t, currentT, tIdx],
    );

    const errorStripLayout = useMemo<Partial<Plotly.Layout>>(
        () => ({
            margin: { l: 55, r: 20, t: 10, b: 28 },
            showlegend: false,
            hovermode: "x",
            xaxis: {
                title: { text: "Time (t)", font: { size: 10 } },
                tickfont: { size: 10 },
                gridcolor: "#f1f5f9",
            },
            yaxis: {
                title: { text: "Rel L₂ (%)", font: { size: 10 } },
                tickfont: { size: 10 },
                gridcolor: "#f1f5f9",
            },
            paper_bgcolor: "transparent",
            plot_bgcolor: "#ffffff",
        }),
        [],
    );

    // Click handler for both 2D Heatmap and E(t) strip to jump to clicked time
    const handleTimeClick = useCallback(
        (event: Readonly<Plotly.PlotMouseEvent>) => {
            if (!event.points || event.points.length === 0) return;
            const pt = event.points[0];
            // In 2D heatmap, time is on Y axis; in E(t) strip, time is on X axis
            const clickedTime =
                activeTab === "2d" && typeof pt.y === "number"
                    ? pt.y
                    : typeof pt.x === "number"
                      ? pt.x
                      : null;

            if (clickedTime !== null) {
                let bestIdx = 0;
                let bestDist = Infinity;
                for (let k = 0; k < t_grid.length; k++) {
                    const d = Math.abs(t_grid[k] - clickedTime);
                    if (d < bestDist) {
                        bestDist = d;
                        bestIdx = k;
                    }
                }
                setIsPlaying(false);
                setTIdx(bestIdx);
            }
        },
        [activeTab, t_grid],
    );

    // Download raw JSON helper
    const handleDownloadJson = () => {
        const blob = new Blob([JSON.stringify(evalData)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `eval_${eval_hash}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const hasLossHistory = loss_history && loss_history.length > 0;

    return (
        <div className="w-full flex flex-col gap-4">
            {/* 1. EXECUTIVE KPI HEADER CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Speedup Card */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-emerald-700">
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                            Inference Speedup
                        </span>
                        <Zap size={16} className="text-emerald-600" />
                    </div>
                    <div className="mt-1">
                        <span className="text-2xl font-extrabold text-emerald-900 font-mono">
                            {metrics.speedup}x
                        </span>
                        <p className="text-[11px] text-emerald-700 font-mono mt-0.5">
                            FEM: {metrics.t_fem}s
                        </p>
                        <p className="text-[11px] text-emerald-700 font-mono mt-0.5">
                            NN: {metrics.t_nn}s
                        </p>
                    </div>
                </div>

                {/* Mean L2 Error Card */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-blue-700">
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                            Mean Rel. L₂ Error
                        </span>
                        <Target size={16} className="text-blue-600" />
                    </div>
                    <div className="mt-1">
                        <span className="text-2xl font-extrabold text-blue-900 font-mono">
                            {metrics.mean_rel_l2.toFixed(2)}%
                        </span>
                        <p className="text-[11px] text-blue-700 font-mono mt-0.5">
                            Global L∞: {metrics.linf_error.toExponential(2)}
                        </p>
                    </div>
                </div>

                {/* Peak Error Card + Jump Button */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-amber-800">
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                            Peak Rel. L₂ Error
                        </span>
                        <AlertTriangle size={16} className="text-amber-600" />
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                        <div>
                            <span className="text-2xl font-extrabold text-amber-900 font-mono">
                                {metrics.max_rel_l2.toFixed(2)}%
                            </span>
                            <p className="text-[11px] text-amber-700 font-mono mt-0.5">
                                at t ={" "}
                                {(t_grid[metrics.worst_t_idx] ?? 0).toFixed(2)}s
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setIsPlaying(false);
                                setTIdx(metrics.worst_t_idx);
                                setActiveTab("1d");
                            }}
                            className="px-2 py-1 text-[10px] font-bold bg-amber-200/80 hover:bg-amber-300 text-amber-900 rounded-md transition-colors cursor-pointer shrink-0"
                            title="Jump Time-Machine to the worst error timestep"
                        >
                            Jump to Peak
                        </button>
                    </div>
                </div>

                {/* Domain & Test Parameter Card */}
                <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-600">
                        <span className="text-[11px] font-bold uppercase tracking-wider">
                            Zero-Shot Setup
                        </span>
                        <Grid size={16} className="text-slate-500" />
                    </div>
                    <div className="mt-1">
                        <span className="text-lg font-extrabold text-slate-800 font-mono">
                            σ = {metrics.sigma_test}
                        </span>
                        <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                            Grid: {metrics.nx} (x) × {metrics.nt} (t)
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. VIEW SWITCHER TABS & CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab("1d")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeTab === "1d"
                                ? "bg-white text-blue-700 shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <Activity size={14} />
                        1D Time-Machine
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("2d")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeTab === "2d"
                                ? "bg-white text-blue-700 shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <Layers size={14} />
                        2D Spatio-Temporal Heatmap
                    </button>
                    {hasLossHistory && (
                        <button
                            type="button"
                            onClick={() => setActiveTab("loss")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                activeTab === "loss"
                                    ? "bg-white text-blue-700 shadow-xs"
                                    : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            <TrendingDown size={14} />
                            Training Convergence
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {activeTab === "1d" && (
                        <button
                            type="button"
                            onClick={() => setLockErrorYAxis(!lockErrorYAxis)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                            title="Lock or auto-scale the error Y-axis across timesteps"
                        >
                            {lockErrorYAxis ? (
                                <>
                                    <Lock size={12} className="text-blue-600" />
                                    Error Y-Axis: Locked
                                </>
                            ) : (
                                <>
                                    <Unlock
                                        size={12}
                                        className="text-amber-600"
                                    />
                                    Error Y-Axis: Auto
                                </>
                            )}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleDownloadJson}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                        title="Download raw evaluation tensors and metrics as JSON"
                    >
                        <Download size={12} />
                        Raw JSON
                    </button>
                </div>
            </div>

            {/* 3. MAIN INTERACTIVE CHART CANVAS */}
            <div className="border border-slate-200 rounded-xl bg-white p-3 shadow-xs">
                {activeTab === "1d" && (
                    <div className={compact ? "h-105" : "h-125"}>
                        <PlotlyChart data={plot1DData} layout={plot1DLayout} />
                    </div>
                )}

                {activeTab === "2d" && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-slate-500 px-2">
                            Click anywhere on the heatmap to jump the
                            Time-Machine to that exact time instant{" "}
                            <span className="font-mono font-semibold">t</span>.
                        </p>
                        <div className={compact ? "h-110" : "h-130"}>
                            <PlotlyChart
                                data={plot2DData}
                                layout={plot2DLayout}
                                onClick={handleTimeClick}
                            />
                        </div>
                    </div>
                )}

                {activeTab === "loss" && hasLossHistory && (
                    <div className={compact ? "h-95" : "h-112.5"}>
                        <PlotlyChart
                            data={[
                                {
                                    x: loss_history!.map((p) => p.epoch),
                                    y: loss_history!.map((p) => p.loss),
                                    type: "scatter",
                                    mode: "lines",
                                    name: "MSE Training Loss",
                                    line: { color: "#4f46e5", width: 2.5 },
                                },
                            ]}
                            layout={{
                                margin: { l: 70, r: 30, t: 30, b: 50 },
                                xaxis: {
                                    title: { text: "Epoch" },
                                    gridcolor: "#f1f5f9",
                                },
                                yaxis: {
                                    title: { text: "MSE Loss (Log Scale)" },
                                    type: "log",
                                    exponentformat: "e",
                                    gridcolor: "#f1f5f9",
                                },
                                paper_bgcolor: "transparent",
                                plot_bgcolor: "#ffffff",
                            }}
                        />
                    </div>
                )}
            </div>

            {/* 4. TEMPORAL ERROR EVOLUTION STRIP E(t) & PLAYBACK CONTROLLER */}
            {activeTab !== "loss" && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                    {/* E(t) Interactive Strip */}
                    <div className="h-28 w-full bg-white rounded-lg border border-slate-100 p-1">
                        <PlotlyChart
                            data={errorStripData}
                            layout={errorStripLayout}
                            config={{ displayModeBar: false }}
                            onClick={handleTimeClick}
                        />
                    </div>

                    {/* Scrubber & Transport Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPlaying(false);
                                    setTIdx((prev) =>
                                        prev > 0 ? prev - 1 : numSteps - 1,
                                    );
                                }}
                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                                title="Previous timestep"
                            >
                                <SkipBack size={16} />
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                                {isPlaying ? (
                                    <>
                                        <Pause size={15} /> Pause
                                    </>
                                ) : (
                                    <>
                                        <Play size={15} fill="currentColor" />{" "}
                                        Play
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsPlaying(false);
                                    setTIdx((prev) => (prev + 1) % numSteps);
                                }}
                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                                title="Next timestep"
                            >
                                <SkipForward size={16} />
                            </button>

                            {/* Speed selector */}
                            <select
                                value={playbackSpeed}
                                onChange={(e) =>
                                    setPlaybackSpeed(Number(e.target.value))
                                }
                                className="ml-1 px-2 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg text-slate-700"
                                title="Playback speed"
                            >
                                <option value={0.25}>0.25x</option>
                                <option value={0.5}>0.5x</option>
                                <option value={1}>1x</option>
                                <option value={2}>2x</option>
                            </select>
                        </div>

                        {/* Time Slider */}
                        <div className="flex-1 min-w-50 flex items-center gap-3">
                            <span className="text-xs font-mono text-slate-500">
                                t₀={t_grid[0]?.toFixed(2)}s
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={numSteps - 1}
                                value={tIdx}
                                onChange={(e) => {
                                    setIsPlaying(false);
                                    setTIdx(Number(e.target.value));
                                }}
                                className="w-full accent-blue-600 cursor-pointer"
                            />
                            <span className="text-xs font-mono text-slate-500">
                                tf={t_grid[numSteps - 1]?.toFixed(2)}s
                            </span>
                        </div>

                        {/* Live Timestep Readout Badges */}
                        <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-800">
                                t = {currentT.toFixed(3)}s ({tIdx + 1}/
                                {numSteps})
                            </span>
                            <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg font-bold text-amber-800">
                                L₂: {(rel_l2_t[tIdx] ?? 0).toFixed(2)}%
                            </span>
                            <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg font-bold text-emerald-800 hidden sm:inline-block">
                                L∞: {(linf_t[tIdx] ?? 0).toExponential(2)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
