import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NB! kui repo nimi on "assembly-exporter", jäta base selliseks.
// Kui kolid custom domeenile või Pages root'i, vaheta base: "/".
export default defineConfig({
  plugins: [react()],
  base: "/assembly-exporter/",
  build: { outDir: "dist" },
});
