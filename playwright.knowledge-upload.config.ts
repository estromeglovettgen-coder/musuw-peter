import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4192'
export default defineConfig({
  testDir: 'e2e',
  testMatch: ['knowledge-upload.spec.ts', 'document-feedback.spec.ts', 'chat-history-feedback.spec.ts', 'knowledge-toolbar.spec.ts', 'knowledge-folders.spec.ts', 'knowledge-folder-actions.spec.ts', 'knowledge-batch-cancel.spec.ts'],
  outputDir: 'test-results/knowledge-upload',
  reporter: [['list']],
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  use: { baseURL, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4192',
    cwd: 'weknora/frontend',
    url: `${baseURL}/e2e/knowledge-upload-harness.html`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
})
