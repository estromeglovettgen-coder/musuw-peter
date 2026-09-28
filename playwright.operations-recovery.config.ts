import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4193'
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'operations-recovery.spec.ts',
  outputDir: 'test-results/operations-recovery',
  reporter: [['list']],
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: { baseURL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4193',
    cwd: 'weknora/frontend',
    url: `${baseURL}/operations.html`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
})
