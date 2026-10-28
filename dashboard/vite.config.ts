import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
    base: "/Gridap-NeuralOperators-GSoC2026/",
    plugins: [react(), tailwindcss()],
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
