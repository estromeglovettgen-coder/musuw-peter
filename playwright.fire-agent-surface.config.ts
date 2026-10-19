import { defineConfig } from '@playwright/test'
const port = 14301
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({
  testDir: 'e2e', testMatch: 'fire-agent-surface.spec.ts', workers: 1, timeout: 30_000,
  use: { baseURL, channel: process.env.PLAYWRIGHT_CHANNEL, locale: 'zh-CN', screenshot: 'only-on-failure' },
  outputDir: 'test-results/fire-agent-surface', reporter: [['list']],
  webServer: { command: `VITE_WORKSPACE_PROFILE=peter VITE_AUTH_MODE=native npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, cwd: 'weknora/frontend', url: `${baseURL}/e2e/fire-agent-surface-harness.html`, reuseExistingServer: false, timeout: 60_000 },
})
