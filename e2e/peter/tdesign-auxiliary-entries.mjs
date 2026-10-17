// Pure UI fixtures for the other production entries. All business APIs are
// intercepted; no admin changes, persisted sessions, or model calls are sent.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4217'
const out = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/tdesign-entries'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = [], warnings = [], checks = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'warning' || message.type() === 'warn') warnings.push(message.text()) })
// Vite preview has no nginx /embed/:channelId fallback. Serve its exact built
// document at the channel URL while keeping every asset on the preview server.
await context.route('**/embed/ui-fixture?*', route => {
  if (route.request().resourceType() !== 'document') return route.continue()
  return route.fulfill({ contentType: 'text/html', body: readFileSync('weknora/frontend/dist/embed.html', 'utf8') })
})
const pass = message => { checks.push(message); console.log('PASS ' + message) }
let configReads = 0
await context.route('**/admin-api/**', route => {
  configReads += 1
  return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '只读界面验收' }) })
})
await context.route('**/api/v1/**', route => {
  const path = new URL(route.request().url()).pathname
  let data = []
  if (path.endsWith('/config')) data = { channel_id: 'ui-fixture', name: '组件验收', agent_id: 'fixture-agent', agent_name: '测试助手', welcome_message: '欢迎使用', knowledge_base_ids: [], show_suggested_questions: false, default_locale: 'zh-CN' }
  else if (path.endsWith('/sessions')) data = { id: 'fixture-session', sig: 'fixture-signature' }
  else if (path.includes('suggested-questions')) data = { questions: [] }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, has_more: false }) })
})
try {
  await page.goto(origin + '/operations.html', { waitUntil: 'domcontentloaded' })
  await page.locator('.ops-bootstrap-error .t-alert').waitFor()
  assert.equal(await page.locator('.ops-bootstrap-error t-alert').count(), 0)
  const beforeRetry = configReads
  await page.locator('.ops-bootstrap-error').getByRole('button', { name: '重试', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.ops-bootstrap-error .t-alert'))
  assert.ok(configReads > beforeRetry)
  await page.screenshot({ path: out + '/operations.png', animations: 'disabled' })
  pass('Operations renders native Alert/Button and its retry action after a bounded fixture failure')
  await page.goto(origin + '/embed/ui-fixture?token=ems_ui_fixture', { waitUntil: 'domcontentloaded' })
  await page.locator('.embed-header__title').filter({ hasText: '组件验收' }).waitFor()
  await page.locator('.embed-chat__input textarea').waitFor()
  assert.equal(await page.locator('.embed-header__action').evaluate(el => el.tagName), 'BUTTON')
  assert.equal(await page.evaluate(() => Boolean(document.querySelector('.embed-header__action svg use') && document.getElementById('t-icon-add'))), true)
  assert.equal(await page.locator('t-button, t-icon, t-input, t-textarea').count(), 0)
  await page.screenshot({ path: out + '/embed.png', animations: 'disabled' })
  pass('Embed renders its native composer/button and an existing local sprite icon')
  assert.deepEqual(errors, [])
  const unresolved = warnings.filter(text => /Failed to resolve component|Failed to resolve directive/.test(text))
  assert.deepEqual(unresolved, [])
  writeFileSync(out + '/acceptance.json', JSON.stringify({ origin, checks, errors, unresolved, fixtureOnly: true }, null, 2))
} catch (error) {
  await page.screenshot({ path: out + '/failure.png' }).catch(() => {})
  writeFileSync(out + '/failure.json', JSON.stringify({ checks, errors, warnings, failure: error.message }, null, 2))
  throw error
} finally { await browser.close() }
