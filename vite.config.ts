import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages'i jaoks: base sõltub repo nimest
// Kui deploy’d domeenile https://<kasutajanimi>.github.io/assembly-exporter/
export default defineConfig({
  plugins: [react()],
  base: "/assembly-exporter/", // ← sinu repo nimi
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
