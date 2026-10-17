// Reads the released workspace; only local appearance preferences are changed.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4217'
const destination = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/theme'
mkdirSync(destination, { recursive: true })
const account = JSON.parse(readFileSync('.runtime/peter/deployment/account.json', 'utf8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  ...(process.env.PETER_FIRE_BROWSER_PROXY ? { proxy: { server: process.env.PETER_FIRE_BROWSER_PROXY } } : {}) })
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', colorScheme: 'dark', viewport: { width: 1440, height: 1000 } })
await context.addInitScript(() => {
  // Keep unrelated first-use tours out of this appearance regression test.
  try {
    const user = JSON.parse(localStorage.getItem('weknora_user') || 'null')
    if (!user?.id) return
    for (const key of ['musuw:new-user-guide-done:v2', 'weknora:contextual-guide-kb-list:v2', 'weknora:contextual-guide-chat:v1']) {
      localStorage.setItem(`Musuw_${user.id}_${key}`, '1')
    }
  } catch { /* No signed-in account on the initial login page. */ }
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
const checks = [], errors = []
page.on('pageerror', error => errors.push(error.message))
const pass = message => { checks.push(message); console.log('PASS ' + message) }
const workspace = async path => {
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
  await page.locator('.visual-user-menu__identity').filter({ hasText: account.email }).waitFor({ timeout: 90000 })
}
const expectTheme = async mode => {
  await page.waitForFunction(mode => document.documentElement.getAttribute('theme-mode') === mode, mode)
  assert.equal(await page.locator('html').getAttribute('data-workspace-brand'), 'fire')
}
const selectTheme = async label => {
  await workspace('/platform/settings?section=general')
  await page.locator('#visual-theme-select').click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await page.locator('.visual-general-settings__select-dropdown').waitFor({ state: 'hidden' })
}
const login = async () => {
  await page.locator('#email').fill(account.email)
  await page.locator('#password').fill(account.password)
  await page.locator('button[type=submit]').click()
  await page.locator('.fire-sidebar-brand').first().waitFor({ timeout: 90000 })
}

try {
  await page.goto(origin + '/auth/start?lang=zh-CN')
  await login()
  await selectTheme('浅色')
  await expectTheme('light')
  await page.screenshot({ path: destination + '/light-settings.png', fullPage: true, animations: 'disabled' })
  await workspace('/platform/knowledge-bases')
  const lightPalette = await page.locator('.visual-sidebar').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color }))
  assert.ok(!['rgb(16, 16, 18)', 'rgb(11, 11, 13)'].includes(lightPalette.background), 'Light mode must use the native light canvas')
  await page.screenshot({ path: destination + '/light-knowledge.png', fullPage: true, animations: 'disabled' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.visual-user-menu__identity').filter({ hasText: account.email }).waitFor()
  await expectTheme('light')
  pass('Settings can select the native light UI and preserve it on page reload')
  await page.locator('.visual-user-menu__trigger').click()
  assert.equal(await page.getByRole('button', { name: '模型管理', exact: true }).count(), 0)
  await page.locator('.visual-user-menu__dropdown .is-danger').click()
  await page.locator('#email').waitFor({ timeout: 90000 })
  await expectTheme('light')
  const logoFilter = await page.locator('.auth-logo').evaluate(el => getComputedStyle(el).filter)
  assert.equal(logoFilter, 'none', 'The Fire logo must retain red under a dark OS theme')
  await page.screenshot({ path: destination + '/light-login.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.auth-logo').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.auth-logo').evaluate(el => getComputedStyle(el).filter), 'none')
  await page.screenshot({ path: destination + '/light-login-mobile.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  pass('Logout keeps the chosen login appearance and the logo stays red')
  await login()
  await expectTheme('light')
  pass('Signing back in restores the same account light preference')
  await workspace('/platform/chat/21022a55-8d1d-4fab-a988-cfa536f70e1b')
  await page.locator('.visual-user-message__bubble').first().waitFor()
  await expectTheme('light')
  await page.screenshot({ path: destination + '/light-saved-chat.png', fullPage: true, animations: 'disabled' })
  pass('An existing conversation remains readable in the native light palette')
  await workspace('/platform/creatChat')
  await page.screenshot({ path: destination + '/light-chat.png', fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.visual-chat-composer__surface').waitFor()
  await expectTheme('light')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await page.screenshot({ path: destination + '/light-mobile.png', fullPage: true, animations: 'disabled' })
  pass('The light new-chat screen fits a mobile viewport')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await selectTheme('深色')
  await expectTheme('dark')
  await workspace('/platform/knowledge-bases')
  assert.equal(await page.locator('.visual-sidebar').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(16, 16, 18)')
  await page.screenshot({ path: destination + '/dark-knowledge.png', fullPage: true, animations: 'disabled' })
  pass('The existing Fire dark UI can be restored without losing native navigation')
  await selectTheme('跟随系统')
  await expectTheme('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expectTheme('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectTheme('dark')
  pass('The native system theme option reacts to OS appearance changes')
  assert.deepEqual(errors, [])
  writeFileSync(destination + '/acceptance.json', JSON.stringify({ origin, accepted: true, checks, lightPalette, logoFilter, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: destination + '/failure.png', fullPage: true }).catch(() => {})
  writeFileSync(destination + '/acceptance.json', JSON.stringify({ origin, accepted: false, checks, errors, failure: error.message }, null, 2))
  throw error
} finally { await browser.close() }
