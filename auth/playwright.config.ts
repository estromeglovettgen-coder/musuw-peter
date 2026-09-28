import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const baseURL = 'http://127.0.0.1:4205';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../test-results/auth-browser',
  reporter: [['list']],
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4205 --strictPort',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: `${baseURL}/auth/start`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
