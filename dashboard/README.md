# GridapROMs.jl - Web Dashboard

This directory contains the frontend web dashboard for **GridapROMs.jl**. It is built using React 19, TypeScript, Vite, and Tailwind CSS. The dashboard acts as a graphical interface to orchestrate the generation of High-Fidelity FEM snapshots, manage training loops for Neural Operators (DeepONet, FNO, NOMAD), and visualize zero-shot evaluations in real-time.

It communicates with the Julia backend via REST APIs and WebSockets orchestrated by `Oxygen.jl`.

## Development Workflow (Requires Node.js)

If you are actively developing the frontend, use the Vite development server to benefit from Hot Module Replacement (HMR).

```bash
# Install dependencies
npm install

# Start the Vite dev server
npm run dev
```
*Note: Ensure the Julia backend (`scripts/server_dashboard.jl` or `dev.sh`) is running concurrently to handle API and WebSocket requests.*

## Production Build (No Node.js Required for End-Users)

To create a static build that can be open without node.js.

```bash
# Generate the static build
npm run build
```

This command bundles and minifies the application into the `dist` directory. The `Oxygen.jl` backend is configured to serve these static files. 
Once the build is generated, end-users only need to start the Julia server:

```bash
julia --project=.. scripts/server_dashboard.jl
```
Then, navigate to `http://127.0.0.1:8080` in a web browser. The entire React application will be served directly by Julia.