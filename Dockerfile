# syntax=docker/dockerfile:1.7


# Layer 1: React Frontend Compilation (Node.js 22)
# ==============================================================================
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

ARG BUILD_THREADS="4"

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


# Layer 3: Final Runtime
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

# Copy the compiled static React files (leaving Node.js behind)
COPY --from=frontend-builder /build/dashboard/dist /app/dashboard/dist

# Copy Julia project files
COPY Project.toml Manifest.toml* ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN julia --project=/app -e 'using Pkg; Pkg.precompile()'

# Pre-create directories expected by DrWatson for Docker volumes (as user)
RUN mkdir -p /app/data/sims /app/data/models /app/plots && \
    chmod -R 777 /usr/local/share/julia /app/data /app/plots

EXPOSE 8080

# Native healthcheck: queries the /api/ping endpoint to verify when Oxygen is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/ping || exit 1

# Launch Julia
CMD ["julia", "--project=/app", "scripts/server_dashboard.jl"]