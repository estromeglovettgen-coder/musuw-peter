import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = Number.parseInt(process.env['MUSUW_BATCH_PLAYWRIGHT_PORT'] ?? '4191', 10)
const baseURL = `http://${host}:${port}`

export default defineConfig({
  expect: { timeout: 8_000 },
  fullyParallel: false,
  outputDir: 'test-results/session-batch',
  preserveOutput: 'always',
  reporter: [['list']],
  retries: 0,
  testDir: 'e2e',
  testMatch: 'session-batch-manage.spec.ts',
  timeout: 60_000,
  use: {
    baseURL,
    colorScheme: 'light',
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port}`,
    cwd: 'weknora/frontend',
    reuseExistingServer: false,
    timeout: 60_000,
    url: `${baseURL}/e2e/session-batch-harness.html`,
  },
  workers: 1,
})
