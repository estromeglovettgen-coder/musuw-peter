import { defineConfig } from "@playwright/test";

const previewPort = Number(process.env.MUSUW_STOREFRONT_PREVIEW_PORT ?? 3000);
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "./browser-tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // SwiftShader rendering and screenshot capture need one runner's resources.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "browser-report", open: "never" }]],
  outputDir: "browser-results",
  use: {
    baseURL: previewUrl,
    browserName: "chromium",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${previewPort} --strictPort`,
    cwd: new URL(".", import.meta.url).pathname,
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
