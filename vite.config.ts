import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/assembly-exporter/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: [
        // Removed @dnd-kit packages - now bundled in
      ]
    }
  },
  optimizeDeps: {
    include: [
      "xlsx",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "lucide-react"
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
});
