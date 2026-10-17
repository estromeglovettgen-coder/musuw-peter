// Hold app modules so the actual production startup screen can be inspected.
import assert from 'node:assert/strict'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4217'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const locale of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale })
    const page = await context.newPage()
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route('**/assets/*.js', async route => { await gate; await route.abort() })
    try {
      await page.goto(origin + '/platform/customers', { waitUntil: 'commit' })
      const status = await page.locator('#musuw-startup-status').innerText()
      assert.match(status, /火种/)
      assert.doesNotMatch(status, /musuw/i)
      assert.equal(await page.locator('#musuw-startup strong').innerText(), '火种')
      assert.equal(await page.evaluate(() => document.documentElement.dataset.workspaceBrand), 'fire')
      console.log(`PASS ${locale}: production startup branding before app modules load`)
    } finally { release(); await context.close() }
  }
} finally { await browser.close() }
