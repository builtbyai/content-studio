import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Dev: proxy /api → wrangler dev on :8787 so the SPA can call /api/... same-origin.
// Prod: Pages serves the SPA on app.example.com; wrangler routes
// `app.example.com/api/*` to the Worker. Same code path.
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
    },
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Heaviest deps go into separate cacheable chunks.
          react:   ["react", "react-dom"],
          motion:  ["motion", "motion/react"],
          icons:   ["lucide-react"],
        },
      },
    },
  },
}));
