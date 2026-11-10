import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API_URL: onde a API roda no desenvolvimento (ex.: `vercel dev` na porta 3000).
// O navegador chama /api/* na mesma origem e o Vite repassa, então o cookie de sessão continua funcionando.
const API_URL = process.env.API_URL || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: API_URL, changeOrigin: false } },
    // reaproveita o CSS e os ícones do front atual (pasta acima de web/)
    fs: { allow: [".."] },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
