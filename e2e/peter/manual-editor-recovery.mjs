// Real deferred-module failure and recovery; only login and unsaved UI work.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4227'
const out = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/manual-editor-recovery'
mkdirSync(out, { recursive: true })
const account = JSON.parse(readFileSync('.runtime/peter/deployment/account.json', 'utf8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = [], checks = []
let blockedRequests = 0, navigations = 0, blockEditor = true
const pass = message => { checks.push(message); console.log('PASS ' + message) }
page.on('pageerror', error => errors.push(error.message))
page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
const chunk = /\/assets\/manual-knowledge-editor-[^/]+\.js(?:\?.*)?$/
await context.route(chunk, route => {
  if (!blockEditor) return route.continue()
  blockedRequests++
  return route.abort('connectionreset')
})
try {
  const auth = await (await context.request.post(origin + '/api/v1/auth/login', { data: account })).json()
  assert.ok(auth.success)
  await context.addInitScript(({ token, refresh, userId }) => {
    localStorage.setItem('weknora_token', token)
    localStorage.setItem('weknora_refresh_token', refresh)
    localStorage.setItem('locale', 'zh-CN')
    for (const key of ['musuw:new-user-guide-done:v2', 'weknora:contextual-guide-kb-list:v2', 'weknora:contextual-guide-kb-detail:v1', 'weknora:contextual-guide-chat:v1']) {
      localStorage.setItem(`Musuw_${userId}_${key}`, '1')
    }
  }, { token: auth.token, refresh: auth.refresh_token, userId: auth.user?.id })
  const ready = () => page.locator('.visual-knowledge-scroll[aria-busy="false"] :is(.visual-document-card,.visual-folder-card)').first().waitFor({ timeout: 60000 })
  await page.goto(origin + '/platform/knowledge-bases/961f9976-ae42-4bc4-bafe-1dfa4506f0c9', { waitUntil: 'domcontentloaded' })
  await ready()
  const skip = page.locator('.guide__skip')
  if (await skip.isVisible()) await skip.click()
  const open = async () => {
    await page.locator('[data-guide="kb-detail-add-doc"]').click()
    await page.getByRole('menuitem', { name: '在线编辑', exact: true }).click()
  }
  const recovery = page.locator('.t-dialog').filter({ hasText: '页面内容未能加载' })
  const beforeFailure = navigations
  await open()
  await recovery.waitFor()
  assert.equal(blockedRequests, 1)
  assert.equal(navigations, beforeFailure, 'A transient editor failure must not reload the whole app automatically')
  pass('A failed editor module offers a native recovery dialog without an automatic reload')
  await recovery.getByRole('button', { name: '取消', exact: true }).click()
  await recovery.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.manual-editor textarea').count(), 0)
  assert.equal(navigations, beforeFailure)
  await open()
  await recovery.waitFor()
  assert.equal(navigations, beforeFailure)
  pass('Cancel releases the failed editor; opening it again still offers recovery')
  await page.screenshot({ path: out + '/recovery.png', animations: 'disabled' })
  blockEditor = false
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    recovery.getByRole('button', { name: '刷新重试', exact: true }).click(),
  ])
  await ready()
  if (await skip.isVisible()) await skip.click()
  await open()
  await page.locator('.manual-editor textarea').waitFor()
  assert.ok((await page.locator('.manual-editor .form-item input').first().inputValue()).length > 0)
  assert.ok((await page.locator('.manual-editor .t-select input').inputValue()).includes('社交课程'))
  await page.locator('.manual-editor textarea').fill('# 未保存恢复验收\n\n网络恢复后编辑器重新可用。')
  await page.getByRole('button', { name: '预览内容', exact: true }).click()
  await page.locator('.manual-editor .preview-container h1').filter({ hasText: '未保存恢复验收' }).waitFor()
  await page.screenshot({ path: out + '/recovered-editor.png', animations: 'disabled' })
  await page.locator('.manual-editor-drawer').getByRole('button', { name: '取消', exact: true }).click()
  pass('An explicit refresh fetches the module again, initializes the current KB, and restores editing and preview')
  assert.deepEqual(errors, [])
  writeFileSync(out + '/acceptance.json', JSON.stringify({ accepted: true, origin, checks, blockedRequests, errors, dataWrites: false }, null, 2))
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {})
  writeFileSync(out + '/acceptance.json', JSON.stringify({ accepted: false, origin, checks, blockedRequests, errors, failure: error.message }, null, 2))
  throw error
} finally { await browser.close() }
