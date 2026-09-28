import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "motion", "three"],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: "all",
    fs: {
      allow: [".."]
    }
  },
  build: {
    target: "es2022"
  }
});
