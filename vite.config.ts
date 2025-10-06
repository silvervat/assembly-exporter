import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/assembly-exporter/",
  build: { outDir: "dist", emptyOutDir: true },
  optimizeDeps: { include: ["xlsx"] },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],  // Lisa see, et impordid leiaksid .tsx automaatselt
  },
});
