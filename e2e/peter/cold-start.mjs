// Real UI regression: appearance-only and unsaved drafts; no generation or data writes.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4217'
const out = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/cold-start'
mkdirSync(out, { recursive: true })
const account = JSON.parse(readFileSync('.runtime/peter/deployment/account.json', 'utf8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
const mobile = process.env.PETER_FIRE_MOBILE === '1'
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile })
const checks = [], errors = [], warnings = [], resources = []
const pass = text => { checks.push(text); console.log('PASS ' + text) }
let page
try {
  const auth = await (await ctx.request.post(origin + '/api/v1/auth/login', { data: account })).json()
  assert.ok(auth.success)
  await ctx.addInitScript(({ token, refresh, userId }) => {
    localStorage.setItem('weknora_token', token)
    localStorage.setItem('weknora_refresh_token', refresh)
    localStorage.setItem('locale', 'zh-CN')
    if (userId) {
      for (const key of ['musuw:new-user-guide-done:v2', 'weknora:contextual-guide-kb-list:v2', 'weknora:contextual-guide-kb-detail:v1', 'weknora:contextual-guide-chat:v1']) {
        localStorage.setItem(`Musuw_${userId}_${key}`, '1')
      }
    }
  }, { token: auth.token, refresh: auth.refresh_token, userId: auth.user?.id })
  page = await ctx.newPage()
  page.on('close', () => writeFileSync(out + '/debug.json', JSON.stringify({ checks, errors, warnings }, null, 2)))
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'warn') warnings.push(message.text()) })
  page.on('request', req => resources.push(new URL(req.url()).pathname))
  await page.addLocatorHandler(page.locator('.guide__skip'), button => button.click())
  // Hold the application JS to prove that HTML feedback precedes the Vue bundle.
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/, async route => { await gate; await route.continue() })
  await page.goto(origin + '/platform/knowledge-bases', { waitUntil: 'commit', timeout: 60000 })
  await page.locator('#musuw-startup').waitFor({ timeout: 2500 })
  assert.match(await page.locator('#musuw-startup-status').innerText(), /正在打开\s*火种/)
  assert.equal(await page.locator('#musuw-startup-retry').isVisible(), false)
  // Capture the pre-module screen without waiting for fonts from held modules.
  const cdp = await ctx.newCDPSession(page)
  writeFileSync(out + '/loading.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await cdp.detach()
  pass('HTML loading feedback appears before application JavaScript; no false failure')
  release()
  await page.locator('.visual-reference-kb-card').first().waitFor({ timeout: 60000 })
  await page.unroute(/\/assets\/.*\.js(?:\?.*)?$/)
  if (process.env.EXPECT_DEFERRED === '1') {
    assert.equal(resources.some(path => /manual-knowledge-editor(?:[.-])/.test(path)), false)
    assert.equal(resources.some(path => /\/RetrievalSettings(?:[.-])/.test(path)), false)
    pass('Closed manual editor and retrieval settings are absent from the cold homepage download')
  }
  const kb = '/platform/knowledge-bases/961f9976-ae42-4bc4-bafe-1dfa4506f0c9'
  await page.goto(origin + kb, { waitUntil: 'domcontentloaded' })
  await page.locator('.visual-knowledge-scroll[aria-busy="false"] :is(.visual-document-card,.visual-folder-card)').first().waitFor({ timeout: 60000 })
  await page.locator('[data-guide="kb-detail-add-doc"]').waitFor({ timeout: 60000 })
  const openEditor = async () => {
    await page.locator('[data-guide="kb-detail-add-doc"]').click()
    await page.getByRole('menuitem', { name: '在线编辑', exact: true }).click()
    await page.locator('.manual-editor textarea').waitFor()
    assert.ok((await page.locator('.manual-editor .form-item input').first().inputValue()).length > 0, 'First open must initialize a title')
    const selectedKB = await page.locator('.manual-editor .t-select input').inputValue()
    assert.ok(selectedKB.includes('社交课程'), 'Current KB must be bound: ' + selectedKB)
  }
  await openEditor()
  await page.locator('.manual-editor textarea').fill('# 本地未保存验收\n\n编辑器首次打开和 Markdown 预览正常。')
  await page.getByRole('button', { name: '预览内容', exact: true }).click()
  await page.locator('.manual-editor .preview-container h1').waitFor()
  assert.equal(await page.locator('.manual-editor .preview-container h1').innerText(), '本地未保存验收')
  await page.screenshot({ path: out + '/manual-preview.png' })
  await page.locator('.manual-editor-drawer').getByRole('button', { name: '取消', exact: true }).click()
  await page.locator('.manual-editor').waitFor({ state: 'hidden' })
  await openEditor()
  assert.equal(await page.locator('.manual-editor textarea').inputValue(), '', 'Canceled draft cannot leak into the next open')
  await page.locator('.manual-editor-drawer').getByRole('button', { name: '取消', exact: true }).click()
  pass('Deferred editor initializes the current KB on first open, previews Markdown, and discards a canceled draft')
  for (const [path, selector] of [
    ['/platform/creatChat', '.visual-chat-composer__surface'],
    ['/platform/chat/21022a55-8d1d-4fab-a988-cfa536f70e1b', '.visual-assistant-message'],
    ['/platform/customers', '.customer-list[aria-busy="false"]'],
    ['/platform/agents', '.agent-list-container'],
    ['/platform/settings?section=general', '.visual-general-settings'],
    [kb + '?tab=wiki&slug=concept/curiosity', '.wiki-reader-body'],
    [kb + '?tab=graph', '.wiki-graph-canvas canvas'],
  ]) {
    await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
    await page.locator(selector).first().waitFor({ timeout: 60000 })
    const unresolvedTags = await page.locator('body').evaluate(body => [...body.querySelectorAll('*')].map(el => el.tagName).filter(name => name.startsWith('T-')))
    assert.deepEqual(unresolvedTags, [], 'No unregistered native controls on ' + path)
    pass('Existing route remains usable: ' + path)
  }
  assert.deepEqual(errors, [], 'No unhandled page errors')
  assert.deepEqual(warnings.filter(text => /Failed to resolve component|Failed to resolve directive/.test(text)), [], 'All native controls remain registered')
  const failedModule = /\/assets\/main-[^/]+\.js(?:\?.*)?$/
  await page.route(failedModule, route => route.abort('failed'))
  await page.goto(origin + '/platform/knowledge-bases', { waitUntil: 'domcontentloaded' })
  await page.locator('#musuw-startup[data-state="failed"]').waitFor()
  assert.match(await page.locator('#musuw-startup-status').innerText(), /未能加载/)
  await page.unroute(failedModule)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.locator('.visual-reference-kb-card').first().waitFor({ timeout: 60000 })
  pass('A real entry-module network failure shows retry and recovers to the actual knowledge list')
  writeFileSync(out + '/acceptance.json', JSON.stringify({ checks, errors, unresolved: warnings.filter(text => /Failed to resolve/.test(text)) }, null, 2))
} catch (error) {
  await page?.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {})
  throw error
} finally { await browser.close() }
