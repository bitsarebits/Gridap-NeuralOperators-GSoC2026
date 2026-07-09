#!/bin/bash

# ==============================================================================
# Development Launcher
# Starts both the Julia API server and the React Vite development server.
# Pressing Ctrl+C will kill both processes.
# ==============================================================================

# Cleanup function
cleanup() {
    # 1. Reset the trap to prevent infinite recursion
    trap - INT TERM ERR EXIT
    
    echo -e '\n🛑 Shutting down both servers...'
    
    # 2. Kill all processes in the current process group
    kill 0
}

# Bind the cleanup function to the signals
trap cleanup INT TERM ERR EXIT

JULIA_CMD="julia"
if [ -f "sys_gridaproms.so" ]; then
    echo "📦 Custom sysimage detected. Booting with extreme speed..."
    JULIA_CMD="julia --sysimage=sys_gridaproms.so"
fi

echo "🚀 [1/2] Starting Julia API Server on port 8080..."
$JULIA_CMD scripts/server_dashboard.jl &

echo "🎨 [2/2] Starting React Vite Server on port 5173..."
cd dashboard && npm run dev &

# Wait for both background processes to finish (or for user to press Ctrl+C)
wait