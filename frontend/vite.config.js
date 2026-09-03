import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-time proxy so the frontend can call same-origin "/api/..." paths
// without CORS ever entering the picture locally; in production you point
// VITE_API_URL at wherever the backend actually lives (see .env.example).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
