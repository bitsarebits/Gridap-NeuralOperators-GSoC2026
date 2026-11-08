# syntax=docker/dockerfile:1.7


# Layer 1: React Frontend Compilation (Node.js 22)
FROM node:22-alpine AS frontend-builder

WORKDIR /build/dashboard

# Copy only the packages before source code (skip npm ci if package.json doesn't change)
COPY dashboard/package.json dashboard/package-lock.json ./

# BuildKit cache mount: maintain the npm cache between different builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy the full dashboard and run the build
COPY dashboard/ ./
RUN npm run build


# Layer 2: Julia dependencies copy
FROM julia:1.12.7-bookworm AS julia-deps

WORKDIR /app

ARG BUILD_THREADS="2"

# Set the Depot in a fixed path and deactivate automatic precompilation to control it manually
ENV JULIA_DEPOT_PATH="/usr/local/share/julia" \
    JULIA_PKG_PRECOMPILE_AUTO=0 \
    JULIA_NUM_PRECOMPILE_TASKS=${BUILD_THREADS} \
    JULIA_NUM_THREADS=${BUILD_THREADS}

# Copy only Project.toml and Manifest.toml to use Docker cache. If they don't change, the layer won't run again
COPY Project.toml Manifest.toml* ./

# Remove the key [sources] or instantiate the environment with all the JLL artifacts
RUN julia --project=/app -e ' \
    using Pkg; \
    Pkg.instantiate(); \
    Pkg.precompile()'


# Layer3: Compilation of the Sysimage
FROM julia-deps AS sysimage-builder

# PackageCompiler requires a C/C++ compiler (gcc/g++) to link the .so file
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

ARG JULIA_CPU_TARGET="native"
ARG BUILD_THREADS="2"

# JULIA_IMAGE_THREADS=2 to limit the C++/LLVM threads of PackageCompiler
ENV JULIA_CPU_TARGET=${JULIA_CPU_TARGET} \
    JULIA_IMAGE_THREADS=${BUILD_THREADS} \
    JULIA_NUM_THREADS=${BUILD_THREADS}

# Copy Julia source code and scripts for precompilation tracing
COPY src/ ./src/
COPY scripts/ ./scripts/

# Run the build script to generate /app/sysimages/sys_NonlinearROMs.so
RUN julia --project=/app scripts/build_sysimage.jl



# Layer 4: Final Runtime
FROM julia:1.12.7-bookworm AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Environment variables for maximum performance:
# - JULIA_NUM_THREADS=auto: essential to prevent WebSockets from blocking during training
# - JULIA_SERVER_HOST=0.0.0.0: enables Docker port-forwarding
ENV JULIA_DEPOT_PATH="/usr/local/share/julia" \
    JULIA_NUM_THREADS="auto" \
    JULIA_SERVER_HOST="0.0.0.0" \
    JULIA_SERVER_PORT="8080"

# Copy the precompiled Julia Depot
COPY --from=julia-deps /usr/local/share/julia /usr/local/share/julia

# Copy the prepared Sysimage (.so) leaving gcc/build-essential behind
COPY --from=sysimage-builder /app/sysimages /app/sysimages

# Copy the compiled static React files (leaving Node.js behind)
COPY --from=frontend-builder /build/dashboard/dist /app/dashboard/dist

# Copy Julia project files
COPY Project.toml Manifest.toml* ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Pre-create directories expected by DrWatson for Docker volumes (as user)
RUN mkdir -p /app/data/sims /app/data/models /app/plots && \
    chmod -R 777 /usr/local/share/julia /app/data /app/plots

EXPOSE 8080

# Native healthcheck: queries the /api/ping endpoint to verify when Oxygen is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/ping || exit 1

# Launch Julia loading the precompiled Sysimage directly
CMD ["julia", "--project=/app", "--sysimage=/app/sysimages/sys_NonlinearROMs.so", "scripts/server_dashboard.jl"]