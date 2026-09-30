import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = 14299
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'customer-chat-archive.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/customer-chat-archive',
  use: { baseURL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: `VITE_WORKSPACE_PROFILE=peter npm run dev -- --host ${host} --port ${port} --strictPort`,
    cwd: 'weknora/frontend',
    url: `${baseURL}/e2e/customer-chat-archive-harness.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
