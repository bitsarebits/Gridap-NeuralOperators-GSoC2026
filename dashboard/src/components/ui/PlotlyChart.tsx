import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";

interface PlotlyChartProps {
    data: Plotly.Data[];
    layout: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    className?: string;
    onClick?: (event: Readonly<Plotly.PlotMouseEvent>) => void;
    onHover?: (event: Readonly<Plotly.PlotMouseEvent>) => void;
}

// Adatta un asse singolo ai colori scuri solo se l'asse è definito
function adaptAxis(axis: Partial<Plotly.LayoutAxis> | undefined) {
    if (!axis || typeof axis !== "object") return axis;

    const updated: Record<string, any> = {
        ...axis,
        gridcolor: "#27272a",
        zerolinecolor: "#3f3f46",
        linecolor: "#3f3f46",
        tickfont: { ...(axis.tickfont || {}), color: "#a1a1aa" },
    };

    if (axis.title) {
        if (typeof axis.title === "string") {
            updated.title = {
                text: axis.title,
                font: { color: "#e4e4e7" },
            };
        } else if (typeof axis.title === "object") {
            updated.title = {
                ...axis.title,
                font: {
                    ...(axis.title.font || {}),
                    color: "#e4e4e7",
                },
            };
        }
    }

    return updated as Partial<Plotly.LayoutAxis>;
}

// Costruisce il layout dark mode modificando solo le proprietà realmente esistenti
function getThemedLayout(
    layout: Partial<Plotly.Layout>,
    isDark: boolean,
): Partial<Plotly.Layout> {
    if (!isDark) return layout;

    const next: Record<string, any> = {
        ...layout,
        paper_bgcolor: "transparent",
        plot_bgcolor: "#18181b",
        font: { ...(layout.font || {}), color: "#e4e4e7" },
    };

    if (layout.title) {
        if (typeof layout.title === "string") {
            next.title = {
                text: layout.title,
                font: { color: "#f4f4f5" },
            };
        } else if (typeof layout.title === "object") {
            next.title = {
                ...layout.title,
                font: {
                    ...(layout.title.font || {}),
                    color: "#f4f4f5",
                },
            };
        }
    }

    if (layout.legend && typeof layout.legend === "object") {
        next.legend = {
            ...layout.legend,
            font: {
                ...(layout.legend.font || {}),
                color: "#e4e4e7",
            },
        };
    }

    // Adatta tutti gli assi presenti (xaxis, yaxis, yaxis2, ecc.) senza aggiungerne di inesistenti
    Object.keys(layout).forEach((key) => {
        if (/^[xy]axis[0-9]*$/.test(key)) {
            const axisObj = (layout as any)[key];
            if (axisObj && typeof axisObj === "object") {
                next[key] = adaptAxis(axisObj);
            }
        }
    });

    return next as Partial<Plotly.Layout>;
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
    const [isDark, setIsDark] = useState<boolean>(() =>
        typeof document !== "undefined"
            ? document.documentElement.classList.contains("dark")
            : false,
    );

    // Sincronizza lo stato locale quando la classe .dark su <html> cambia
    useEffect(() => {
        const root = document.documentElement;
        const observer = new MutationObserver(() => {
            setIsDark(root.classList.contains("dark"));
        });
        observer.observe(root, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

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

        const themedLayout = getThemedLayout(layout, isDark);

        try {
            Plotly.react(el, data, themedLayout, defaultConfig);
        } catch (err) {
            console.error("[PlotlyChart] Errore di rendering Plotly:", err);
            return;
        }

        const plotlyEl = el as unknown as Plotly.PlotlyHTMLElement;

        if (onClick) {
            plotlyEl.removeAllListeners?.("plotly_click");
            plotlyEl.on("plotly_click", onClick);
        }
        if (onHover) {
            plotlyEl.removeAllListeners?.("plotly_hover");
            plotlyEl.on("plotly_hover", onHover);
        }
    }, [data, layout, config, onClick, onHover, isDark]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current) {
                try {
                    Plotly.Plots.resize(containerRef.current);
                } catch {
                    // Ignora eventuali resize eseguiti durante lo smontaggio
                }
            }
        });

        resizeObserver.observe(el);

        return () => {
            resizeObserver.disconnect();
            if (el) {
                try {
                    Plotly.purge(el);
                } catch {
                    // Evita crash se l'elemento è già stato rimosso dal DOM
                }
            }
        };
    }, []);

    return <div ref={containerRef} className={className} />;
}
