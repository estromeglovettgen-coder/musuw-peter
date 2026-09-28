import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'startup-feedback.spec.ts',
  outputDir: 'test-results/startup-feedback',
  reporter: [['list']],
  workers: 2,
  timeout: 20_000,
  expect: { timeout: 3_000 },
  use: {
    viewport: { width: 430, height: 932 },
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
