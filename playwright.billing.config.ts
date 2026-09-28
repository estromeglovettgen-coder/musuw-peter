import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = Number.parseInt(process.env['MUSUW_BILLING_PLAYWRIGHT_PORT'] ?? '14293', 10)
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'billing-entitlement.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/billing',
  use: { baseURL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    cwd: 'weknora/frontend',
    url: `${baseURL}/e2e/billing-harness.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
