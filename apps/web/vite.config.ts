import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// API_PORT: aponta para outro servidor (ex.: uma instância isolada de testes).
const API = `127.0.0.1:${process.env.API_PORT ?? 4317}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5317,
    strictPort: true,
    proxy: {
      "/api": `http://${API}`,
      "/ws": { target: `ws://${API}`, ws: true },
    },
  },
});
