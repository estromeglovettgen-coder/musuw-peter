import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:14301'
export default defineConfig({
  testDir: 'e2e', testMatch: 'customer-graph-mobile.spec.ts', workers: 1,
  timeout: 30_000, expect: { timeout: 10_000 }, reporter: [['list']],
  use: { baseURL, locale: 'zh-CN', screenshot: 'only-on-failure' },
  webServer: {
    command: 'VITE_WORKSPACE_PROFILE=peter npm run dev -- --host 127.0.0.1 --port 14301 --strictPort',
    cwd: 'weknora/frontend', url: `${baseURL}/e2e/mobile-harness.html`,
    reuseExistingServer: false, timeout: 60_000,
  },
})
