import { defineConfig } from "@playwright/test";

const browserHost = "127.0.0.1";
const browserPort = Number.parseInt(process.env["M1_PLAYWRIGHT_PORT"] ?? "3100", 10);
if (!Number.isInteger(browserPort) || browserPort < 1024 || browserPort > 65_535) {
  throw new Error("M1_PLAYWRIGHT_PORT must be an integer between 1024 and 65535");
}
const browserBaseUrl = `http://${browserHost}:${browserPort}`;
const performanceMode = process.env["M1_PERFORMANCE_MODE"] === "1";
const browserOutputName = process.env["M1_PLAYWRIGHT_OUTPUT_NAME"];
if (browserOutputName && !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(browserOutputName)) {
  throw new Error("M1_PLAYWRIGHT_OUTPUT_NAME must be a stable lowercase identifier");
}

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  outputDir: performanceMode
    ? "test-results/m1-performance/playwright"
    : `test-results/m1-browser${browserOutputName ? `/${browserOutputName}` : ""}`,
  preserveOutput: "always",
  reporter: [["list"]],
  retries: 0,
  testDir: "tests/browser",
  testMatch: performanceMode ? "m1-performance.spec.ts" : "m1-workspace.spec.ts",
  timeout: 45_000,
  use: {
    baseURL: browserBaseUrl,
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `exec node node_modules/next/dist/bin/next start --hostname ${browserHost} --port ${browserPort}`,
    env: {
      DATABASE_URL: process.env["DATABASE_URL"] ?? "",
      M1_FIXTURE_MODE: process.env["M1_FIXTURE_MODE"] ?? "0",
      M1_SESSION_SECRET: process.env["M1_SESSION_SECRET"] ?? "",
    },
    reuseExistingServer: false,
    timeout: 60_000,
    url: browserBaseUrl,
  },
  workers: 1,
});
