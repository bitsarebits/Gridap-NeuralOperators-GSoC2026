import axios from 'axios';

// Define the payload structure that will be sent to Julia
export interface SimulationPayload {
  fem_config: {
    beta_start: number;
    beta_end: number;
    beta_step: number;
    order: number;
    L: number;
    nx: number;
    t0: number;
    dt: number;
    tf: number;
    c: number;
    theta: number;
  };
  eval_config: {
    sigma_test: number;
  };
  solver: Record<string, any>;    // Accepts parameters from DeepONet and FNO
  scheduler: Record<string, any>;
}

// Define the response that we are waiting from Julia
export interface SimulationResponse {
  status: string;
  data_hash?: string;
  model_hash?: string;
  eval_hash?: string;
  image_url?: string;

}

// Base instance for Axios
export const api = axios.create({
  baseURL: 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Function for the simulation
export const runSimulation = async (payload: SimulationPayload): Promise<SimulationResponse> => {
  const response = await api.post<SimulationResponse>('/api/run_model', payload);
  return response.data;
};