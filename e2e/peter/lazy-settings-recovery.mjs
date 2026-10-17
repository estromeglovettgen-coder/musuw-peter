// Real deferred settings failures; log in and inspect existing UI, never save.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4227'
const out = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/lazy-settings-recovery'
const account = JSON.parse(readFileSync('.runtime/peter/deployment/account.json', 'utf8'))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
const results = []
try {
  for (const kind of ['retrieval', 'settings']) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    const errors = [], checks = []
    let blockedRequests = 0, navigations = 0, blocked = true
    page.on('pageerror', error => errors.push(error.message))
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
    const chunk = kind === 'retrieval' ? /\/assets\/RetrievalSettings-[^/]+\.js(?:\?.*)?$/ : /\/assets\/Settings-[^/]+\.js(?:\?.*)?$/
    await context.route(chunk, route => {
      if (!blocked) return route.continue()
      blockedRequests++
      return route.abort('connectionreset')
    })
    const pass = message => { checks.push(message); console.log(`PASS ${kind}: ${message}`) }
    try {
      const auth = await (await context.request.post(origin + '/api/v1/auth/login', { data: account })).json()
      assert.ok(auth.success)
      await context.addInitScript(({ token, refresh, userId }) => {
        localStorage.setItem('weknora_token', token)
        localStorage.setItem('weknora_refresh_token', refresh)
        localStorage.setItem('locale', 'zh-CN')
        for (const key of ['musuw:new-user-guide-done:v2', 'weknora:contextual-guide-kb-list:v2', 'weknora:contextual-guide-kb-detail:v1', 'weknora:contextual-guide-chat:v1']) localStorage.setItem(`Musuw_${userId}_${key}`, '1')
      }, { token: auth.token, refresh: auth.refresh_token, userId: auth.user?.id })
      const baseline = kind === 'retrieval' ? '/platform/knowledge-bases' : '/platform/agents'
      await page.goto(origin + baseline, { waitUntil: 'domcontentloaded' })
      const ready = async () => {
        await page.locator(kind === 'retrieval' ? '.visual-reference-kb-card' : '.agent-card .card-title[title="泰勒"]').first().waitFor({ timeout: 60000 })
        if (await page.locator('.guide__skip').isVisible()) await page.locator('.guide__skip').click()
      }
      await ready()
      const openContainer = async () => {
        if (kind === 'retrieval') {
          await page.keyboard.press('Control+k')
          await page.locator('.cmdk__input').waitFor()
        } else {
          const card = page.locator('.agent-card').filter({ has: page.locator('.card-title[title="泰勒"]') }).first()
          await card.getByRole('button', { name: '更多', exact: true }).click()
          await page.locator('.card-more-popup .popup-menu-item').filter({ hasText: /^编辑$/ }).click()
          const modal = page.locator('.agent-editor-modal')
          await modal.waitFor()
          const skills = modal.locator('[data-guide="agent-editor-nav-skills"]')
          if (!await skills.isVisible()) await modal.locator('.peter-editor-advanced-trigger').click()
          await skills.click()
          await modal.locator('.go-settings-link').filter({ hasText: /^管理技能$/ }).first().waitFor()
        }
      }
      const open = async () => {
        if (kind === 'retrieval') await page.locator('.cmdk__input-row .cmdk__icon-btn').first().click()
        else await page.locator('.agent-editor-modal .go-settings-link').filter({ hasText: /^管理技能$/ }).first().click()
      }
      await openContainer()
      const recovery = page.locator('.t-dialog').filter({ hasText: '页面内容未能加载' })
      const beforeFailure = navigations
      await open()
      await recovery.waitFor()
      assert.equal(blockedRequests, 1)
      assert.equal(navigations, beforeFailure)
      pass('The real settings chunk failure opens the native dialog without an automatic reload')
      await recovery.getByRole('button', { name: '取消', exact: true }).click()
      await recovery.waitFor({ state: 'hidden' })
      if (kind === 'retrieval') {
        await page.locator('.cmdk-retrieval-drawer .t-drawer').waitFor({ state: 'hidden' })
        assert.ok(await page.locator('.cmdk__input').isVisible())
      } else assert.ok(await page.locator('.agent-editor-modal').isVisible())
      await open()
      await recovery.waitFor()
      assert.equal(navigations, beforeFailure)
      pass('Cancel closes only this lazy consumer and reopening still offers recovery')
      await page.screenshot({ path: `${out}/${kind}-recovery.png`, animations: 'disabled' })
      blocked = false
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        recovery.getByRole('button', { name: '刷新重试', exact: true }).click(),
      ])
      await ready()
      await openContainer()
      await open()
      await page.locator(kind === 'retrieval' ? '.retrieval-settings' : '.skill-settings').waitFor()
      assert.equal(new URL(page.url()).pathname, baseline, 'Settings recovery must preserve the route')
      pass('An explicit refresh restores the same entry and its native settings content')
      await page.screenshot({ path: `${out}/${kind}-recovered.png`, animations: 'disabled' })
      assert.deepEqual(errors, [])
      results.push({ kind, accepted: true, blockedRequests, checks, errors })
    } catch (error) {
      await page.screenshot({ path: `${out}/${kind}-failure.png`, fullPage: true }).catch(() => {})
      results.push({ kind, accepted: false, blockedRequests, checks, errors, failure: error.message })
      throw error
    } finally { await context.close() }
  }
} finally {
  writeFileSync(out + '/acceptance.json', JSON.stringify({ accepted: results.length === 2 && results.every(x => x.accepted), origin, dataWrites: false, results }, null, 2))
  await browser.close()
}
