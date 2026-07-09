@echo off
setlocal

:: Set variables
set SYSIMAGE=sysimages\sys_gridaproms.so
set SERVER_SCRIPT=scripts\server_dashboard.jl
set JULIA_CMD=julia --project=. -t 4

echo ===========================================================
echo    Starting GridapROMs GSoC 2026 Environment
echo ===========================================================

:: Smart Sysimage Detection
if exist "%SYSIMAGE%" (
    echo [INFO] Custom sysimage detected! Booting with maximum performance...
    set JULIA_CMD=%JULIA_CMD% --sysimage="%SYSIMAGE%"
) else (
    echo [INFO] Standard boot (No sysimage found).
    echo        Tip: Run 'julia scripts\build_sysimage.jl' once to eliminate startup times.
)

echo [INFO] Launching Server...
%JULIA_CMD% %SERVER_SCRIPT%

endlocal