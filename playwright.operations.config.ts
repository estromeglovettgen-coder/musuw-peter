import { defineConfig } from '@playwright/test'

export default defineConfig({
  expect: { timeout: 8_000 },
  fullyParallel: false,
  outputDir: 'test-results/operations-console',
  reporter: [['list']],
  retries: 0,
  testDir: 'e2e',
  testMatch: 'operations-console.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4186',
    colorScheme: 'light',
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
})
