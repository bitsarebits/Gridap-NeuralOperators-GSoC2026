#!/bin/bash

# Configuration
SYSIMAGE="sysimages/sys_gridaproms.so"
SERVER_SCRIPT="scripts/server_dashboard.jl"
JULIA_CMD="julia --project=. -t 4"

echo "==========================================================="
echo "   Starting GridapROMs GSoC 2026 Environment"
echo "==========================================================="

# Smart Sysimage Detection
if [ -f "$SYSIMAGE" ]; then
    echo "[INFO] Custom sysimage detected! Booting with maximum performance..."
    JULIA_CMD="$JULIA_CMD --sysimage=$SYSIMAGE"
else
    echo "[INFO] Standard boot (No sysimage found)."
    echo "       Tip: Run 'julia scripts/build_sysimage.jl' once to eliminate startup times."
fi

echo "[INFO] Launching Server..."
$JULIA_CMD $SERVER_SCRIPT