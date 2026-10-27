import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

interface PlotlyChartProps {
    data: Plotly.Data[];
    layout: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    className?: string;
    onClick?: (event: Readonly<Plotly.PlotMouseEvent>) => void;
    onHover?: (event: Readonly<Plotly.PlotMouseEvent>) => void;
}

export default function PlotlyChart({
    data,
    layout,
    config,
    className = "w-full h-full",
    onClick,
    onHover,
}: PlotlyChartProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const defaultConfig: Partial<Plotly.Config> = {
            responsive: true,
            displaylogo: false,
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
            toImageButtonOptions: {
                format: "png",
                filename: "gridaproms_plot",
                height: 800,
                width: 1200,
                scale: 2,
            },
            ...config,
        };

        Plotly.react(el, data, layout, defaultConfig);

        const plotlyEl = el as unknown as Plotly.PlotlyHTMLElement;

        if (onClick) {
            plotlyEl.removeAllListeners?.("plotly_click");
            plotlyEl.on("plotly_click", onClick);
        }
        if (onHover) {
            plotlyEl.removeAllListeners?.("plotly_hover");
            plotlyEl.on("plotly_hover", onHover);
        }
    }, [data, layout, config, onClick, onHover]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current) {
                Plotly.Plots.resize(containerRef.current);
            }
        });

        resizeObserver.observe(el);

        return () => {
            resizeObserver.disconnect();
            if (el) {
                Plotly.purge(el);
            }
        };
    }, []);

    return <div ref={containerRef} className={className} />;
}
