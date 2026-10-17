// Uses saved conversations; no model calls or business-data writes.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4217'
const sessionID = '21022a55-8d1d-4fab-a988-cfa536f70e1b'
const destination = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/refinement'
mkdirSync(destination, { recursive: true })
const account = JSON.parse(readFileSync('.runtime/peter/deployment/account.json', 'utf8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  ...(process.env.PETER_FIRE_BROWSER_PROXY ? { proxy: { server: process.env.PETER_FIRE_BROWSER_PROXY } } : {}) })
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1586, height: 992 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
await page.addLocatorHandler(page.locator('.guide__skip'), button => button.click())
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
const pass = message => { checks.push(message); console.log('PASS ' + message) }
const go = async path => {
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
  await page.locator('.visual-user-menu__identity').filter({ hasText: account.email }).waitFor({ timeout: 90000 })
}
try {
  await page.goto(origin + '/auth/start?lang=zh-CN')
  await page.locator('#email').fill(account.email)
  await page.locator('#password').fill(account.password)
  await page.locator('button[type=submit]').click()
  await page.locator('.fire-sidebar-brand').first().waitFor({ timeout: 90000 })
  pass('Native account login reaches the released workspace')
  const sessionLoaded = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/sessions/${sessionID}` && response.request().method() === 'GET')
  await go(`/platform/chat/${sessionID}`)
  const sessionResponse = await sessionLoaded
  assert.equal(sessionResponse.status(), 200, 'The saved conversation must really load from the server')
  assert.equal(new URL(page.url()).pathname, `/platform/chat/${sessionID}`)
  await page.locator('.visual-user-message__bubble').first().waitFor({ timeout: 90000 })
  const bubble = await page.locator('.visual-user-message').first().evaluate(el => {
    const b = el.querySelector('.visual-user-message__bubble'), c = getComputedStyle(b)
    return { container: getComputedStyle(el).backgroundColor, background: c.backgroundColor,
      radius: parseFloat(c.borderRadius), width: b.getBoundingClientRect().width, rowWidth: el.getBoundingClientRect().width }
  })
  assert.equal(bubble.container, 'rgba(0, 0, 0, 0)', 'The message row must not become a full-width colored strip')
  assert.equal(bubble.background, 'rgb(36, 25, 30)')
  assert.ok(bubble.radius >= 12)
  assert.ok(bubble.width < bubble.rowWidth * 0.85, 'Short user text must stay in a compact bubble')
  await page.locator('.visual-user-message__bubble').first().scrollIntoViewIfNeeded()
  await page.locator('.visual-user-message').first().screenshot({ path: destination + '/user-bubble.png' })
  await page.screenshot({ path: destination + '/chat-desktop.png', fullPage: true })
  pass('Saved chat shows a compact rounded Fire bubble on a transparent row')
  await page.locator('.visual-user-menu__trigger').click()
  await page.locator('.visual-user-menu__dropdown').waitFor()
  assert.equal(await page.locator('.visual-user-menu__dropdown').getByRole('button', { name: '模型管理', exact: true }).count(), 0)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  await page.locator('.visual-general-settings').waitFor()
  assert.equal(await page.getByRole('button', { name: '模型管理', exact: true }).count(), 0)
  pass('Account menu and settings navigation hide model management')
  await go('/platform/settings?section=models')
  await page.locator('.visual-general-settings').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('section'), 'general')
  assert.equal(await page.locator('.visual-model-settings').count(), 0)
  pass('Old model-management links fall back to general settings')
  await go(`/platform/chat/${sessionID}`)
  await page.locator('.visual-chat-composer__surface').waitFor()
  await page.locator('.visual-chat-composer__surface').getByText(/DeepSeek/).first().waitFor()
  assert.match(await page.locator('.visual-chat-composer__surface').innerText(), /DeepSeek/)
  pass('The native chat model selector remains available')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.visual-user-message__bubble').first().waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  assert.equal(await page.locator('.visual-user-message').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)')
  await page.screenshot({ path: destination + '/chat-mobile.png', fullPage: true })
  pass('Mobile chat fits without overflow or a full-width background strip')
  assert.deepEqual(errors, [])
  writeFileSync(destination + '/acceptance.json', JSON.stringify({ origin, accepted: true, checks, bubble, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: destination + '/failure.png', fullPage: true }).catch(() => {})
  writeFileSync(destination + '/acceptance.json', JSON.stringify({ origin, accepted: false, checks, errors, failure: error.message }, null, 2))
  throw error
} finally { await browser.close() }
