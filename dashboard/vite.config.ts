import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
    base: "/Gridap-NeuralOperators-GSoC2026/",
    plugins: [react(), tailwindcss()],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("plotly.js-dist-min")) {
                        return "plotly";
                    }
                    if (
                        id.includes("node_modules/react/") ||
                        id.includes("node_modules/react-dom/") ||
                        id.includes("@tanstack/react-query") ||
                        id.includes("react-hook-form") ||
                        id.includes("zod")
                    ) {
                        return "vendor";
                    }
                },
            },
        },
    },
    server: {
        // Proxy API and WebSocket requests to the local Julia backend.
        // This allows VS Code Web Tunnels and LAN devices to use a single port (5173).
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8080",
                changeOrigin: true,
            },
            "/ws": {
                target: "ws://127.0.0.1:8080",
                ws: true,
                changeOrigin: true,
            },
        },
    },
});
