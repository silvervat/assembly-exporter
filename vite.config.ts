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
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities',
        '@dnd-kit/accessibility'
      ]
    }
  },
  optimizeDeps: { include: ["xlsx"] },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
});
