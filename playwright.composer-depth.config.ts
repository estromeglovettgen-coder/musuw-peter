import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4194'
export default defineConfig({
  testDir: 'e2e', testMatch: 'composer-depth.spec.ts',
  outputDir: `test-results/composer-depth/${process.env.VITE_WORKSPACE_PROFILE || 'standard'}`,
  reporter: [['list']], retries: 0, workers: 1, timeout: 30_000,
  expect: { timeout: 5_000 },
  use: { baseURL, channel: process.env.PLAYWRIGHT_CHANNEL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4194', cwd: 'weknora/frontend',
    url: `${baseURL}/e2e/composer-depth-harness.html`, timeout: 60_000, reuseExistingServer: false,
  },
})
