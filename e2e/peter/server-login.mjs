// Explicit live acceptance of Musuw's original UI with Peter's native account.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const runtime = '.runtime/peter/deployment'
const origin = process.env.PETER_ACCEPTANCE_ORIGIN || 'https://62.234.188.55'
const account = JSON.parse(readFileSync(`${runtime}/account.json`, 'utf8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
const externalRequests = new Set()
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (request.url().startsWith('http') && new URL(request.url()).origin !== origin) {
    externalRequests.add(new URL(request.url()).origin)
  }
})
await page.addLocatorHandler(page.getByRole('button', { name: '跳过引导', exact: true }).first(), button => button.click())
const checks = []
const pass = name => { checks.push(name); console.log(`PASS ${name}`) }
try {
  await page.goto(`${origin}/login?lang=zh-CN`)
  await page.locator('#email').waitFor()
  assert.equal(await page.locator('.auth-showcase').count(), 1)
  assert.equal(await page.locator('.login-layout').count(), 0)
  assert.equal(await page.locator('.auth-provider-options,.auth-mode-switch,.auth-forgot').count(), 0)
  await page.screenshot({ path: `${runtime}/login-after.png`, fullPage: true })
  pass('Original Musuw split login, branding and animations; private password actions only')

  await page.locator('#email').fill(account.email)
  await page.locator('#password').fill('Invalid-acceptance-password-7!')
  await page.locator('button[type=submit]').click()
  await page.getByRole('alert').filter({ hasText: '邮箱或密码不正确' }).waitFor()
  assert.equal(await page.locator('button[type=submit]').isEnabled(), true)
  pass('Real wrong-password response is visible and allows retry')

  await page.locator('#password').fill(account.password)
  await page.route('**/api/v1/auth/login', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }), { times: 1 })
  await page.locator('button[type=submit]').click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('button[type=submit]').isEnabled(), true)
  pass('Temporary API failure remains recoverable in the original form')

  await page.locator('#password').fill(account.password)
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/platform/**', { timeout: 60000 })
  await page.getByText('工作区', { exact: true }).first().waitFor({ timeout: 60000 })
  assert.equal(await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('weknora_token')}` } })
    return (await response.json()).data.user.email
  }), account.email)
  await page.reload()
  await page.getByText('工作区', { exact: true }).first().waitFor({ timeout: 60000 })
  pass('Existing Peter account signs in and survives refresh with the correct user')

  await page.goto(`${origin}/login`)
  await page.waitForURL('**/platform/**', { timeout: 60000 })
  await page.getByText('工作区', { exact: true }).first().waitFor({ timeout: 60000 })
  pass('An existing authenticated session resumes without a login loop')

  await page.locator('.visual-user-menu__trigger').click()
  await page.locator('.visual-user-menu__item.is-danger').click()
  await page.locator('#email').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('.auth-showcase').count(), 1)
  assert.equal(await page.evaluate(() => localStorage.getItem('weknora_token')), null)
  await page.reload()
  await page.locator('#email').waitFor()
  pass('Workspace logout and reload return to the Musuw login page')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${runtime}/login-mobile.png`, fullPage: true })
  assert.equal(await page.locator('.auth-showcase').isVisible(), false)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  pass('Mobile login remains usable without horizontal overflow')
  assert.deepEqual(errors, [])
  assert.deepEqual([...externalRequests], [])
  pass('No browser exceptions or requests to Musuw hosted identity services')
  writeFileSync(`${runtime}/login-acceptance.json`, JSON.stringify({ at: new Date().toISOString(), origin, checks }, null, 2))
} finally {
  await browser.close()
}
