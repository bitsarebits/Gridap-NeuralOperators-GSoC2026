#!/bin/bash

# ==============================================================================
# Development Launcher
# Starts both the Julia API server and the React Vite development server.
# Pressing Ctrl+C will kill both processes.
# ==============================================================================

# Trap keyboard interrupt (Ctrl+C) and kill all child processes in this group
trap "echo -e '\n🛑 Shutting down both servers...'; kill 0; exit" INT TERM ERR EXIT

echo "🚀 [1/2] Starting Julia API Server on port 8080..."
julia scripts/server_dashboard.jl &

echo "🎨 [2/2] Starting React Vite Server on port 5173..."
cd dashboard && npm run dev &

# Wait for both background processes to finish (or for user to press Ctrl+C)
wait