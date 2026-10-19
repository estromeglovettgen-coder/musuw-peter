import { defineConfig } from '@playwright/test'
const baseURL = 'http://127.0.0.1:4195'
export default defineConfig({
 testDir: 'e2e', testMatch: 'fire-membership.spec.ts', outputDir: 'test-results/fire-membership', reporter: [['list']], workers: 1, retries: 0, timeout: 20000,
 expect: { timeout: 5000 }, use: { baseURL, channel: process.env.PLAYWRIGHT_CHANNEL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
 webServer: { command: 'VITE_WORKSPACE_PROFILE=peter VITE_AUTH_MODE=native npm run dev -- --host 127.0.0.1 --port 4195', cwd: 'weknora/frontend', url: `${baseURL}/e2e/fire-membership-harness.html`, timeout: 60000, reuseExistingServer: false },
})
