import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { authConfigFromEnvironment } from "./src/config";

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, ".", "");
  // A Vite production build inlines these values. Refuse to produce an asset
  // bundle that will only fail later in the browser if the release command did
  // not supply the public identity configuration.
  if (command === "build") {
    authConfigFromEnvironment(environment as ImportMetaEnv);
  }
  const nativeAPI = environment["VITE_DEV_PROXY_TARGET"] ?? "http://127.0.0.1:18080";
  const proxy = {
    "/api": { changeOrigin: true, secure: false, target: nativeAPI },
  };

  return {
    base: "/auth/",
    plugins: [react()],
    preview: { host: "127.0.0.1", proxy },
    server: { host: "127.0.0.1", proxy },
  };
});
