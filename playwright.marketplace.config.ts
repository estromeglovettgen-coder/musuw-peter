import { defineConfig } from '@playwright/test'
const host = '127.0.0.1'
const port = Number(process.env.MUSUW_MARKETPLACE_PLAYWRIGHT_PORT || 14296)
const baseURL = `http://${host}:${port}`
export default defineConfig({
  testDir: 'e2e', testMatch: ['creator-marketplace.spec.ts', 'marketplace-detail-ui.spec.ts', 'marketplace-content-preview.spec.ts', 'marketplace-example-conversation.spec.ts'], workers: 1, fullyParallel: false,
  timeout: 45_000, expect: { timeout: 10_000 }, retries: 0, reporter: [['list']],
  outputDir: 'test-results/creator-marketplace',
  use: { baseURL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `npm run dev -- --host ${host} --port ${port} --strictPort`, cwd: 'weknora/frontend', url: `${baseURL}/e2e/marketplace-harness.html`, reuseExistingServer: false, timeout: 60_000 },
})
