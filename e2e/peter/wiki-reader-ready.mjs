// Existing Beijing Wiki data through native UI/APIs; never save or call a model.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

const origin = process.env.PETER_FIRE_ORIGIN || 'http://127.0.0.1:4227'
const out = process.env.PETER_FIRE_ARTIFACTS || 'artifacts/fire-ui-implementation-20261017/wiki-reader-ready'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] })
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
const checks = [], errors = []
let unblockDirectory, unblockFirstArticle, markFirstArticleHeld, directoryRequests = 0, statsRequests = 0, documentRequests = 0, metadataRequests = 0
let initialRequests
const kbApi = '/api/v1/knowledge-bases/961f9976-ae42-4bc4-bafe-1dfa4506f0c9'
const directoryGate = new Promise(resolve => { unblockDirectory = resolve })
const firstArticleGate = new Promise(resolve => { unblockFirstArticle = resolve })
const firstArticleStarted = new Promise(resolve => { markFirstArticleHeld = resolve })
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  const pathname = new URL(request.url()).pathname
  if (pathname.endsWith('/wiki/stats')) statsRequests++
  if (request.method() === 'GET' && pathname === kbApi) metadataRequests++
  if (request.method() === 'GET' && pathname === kbApi + '/knowledge') documentRequests++
})
await context.route(/\/wiki\/(?:pages|index|folders)(?:\?|$)/, async route => {
  directoryRequests++
  await directoryGate
  await route.continue()
})
await context.route(/\/wiki\/pages\/concept\/conquest-desire(?:\?|$)/, async route => {
  markFirstArticleHeld()
  await firstArticleGate
  await route.continue()
})
const pass = text => { checks.push(text); console.log('PASS ' + text) }
try {
  const account = JSON.parse(readFileSync('.runtime/peter/deployment/account.json', 'utf8'))
  const auth = await (await context.request.post(origin + '/api/v1/auth/login', { data: account })).json()
  assert.ok(auth.success)
  await context.addInitScript(({ token, refresh, userId }) => {
    localStorage.setItem('weknora_token', token)
    localStorage.setItem('weknora_refresh_token', refresh)
    localStorage.setItem('locale', 'zh-CN')
    for (const key of ['musuw:new-user-guide-done:v2', 'weknora:contextual-guide-kb-list:v2', 'weknora:contextual-guide-kb-detail:v1', 'weknora:contextual-guide-chat:v1']) localStorage.setItem(`Musuw_${userId}_${key}`, '1')
  }, { token: auth.token, refresh: auth.refresh_token, userId: auth.user?.id })
  await page.goto(origin + '/platform/knowledge-bases/961f9976-ae42-4bc4-bafe-1dfa4506f0c9?tab=wiki&slug=concept/curiosity', { waitUntil: 'domcontentloaded' })
  await page.locator('.wiki-reader-title-text').filter({ hasText: /^好奇心$/ }).waitFor({ timeout: 60000 })
  assert.ok((await page.locator('.wiki-reader-body').innerText()).length > 50)
  assert.ok(directoryRequests > 0, 'The native directory APIs should really be held pending')
  assert.equal(statsRequests, 1, 'The parent and Wiki must not both request stats on this route')
  assert.equal(metadataRequests, 1, 'The customer resolver and native detail must share one metadata read')
  assert.equal(documentRequests, 0, 'A direct Wiki route must not fetch document lists')
  initialRequests = { directoryRequests, statsRequests, metadataRequests, documentRequests }
  pass('The real Chinese article renders while all native directory/index/list responses are blocked')
  await page.screenshot({ path: out + '/blocked-directory-readable.png', animations: 'disabled' })
  unblockDirectory()
  const footer = page.locator('.wiki-reader-footer')
  await footer.getByRole('link', { name: '征服欲', exact: true }).waitFor()
  await footer.getByRole('link', { name: '征服欲', exact: true }).click()
  await firstArticleStarted
  await footer.getByRole('link', { name: '生命力', exact: true }).click()
  await page.locator('.wiki-reader-title-text').filter({ hasText: /^生命力$/ }).waitFor()
  const late = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/wiki/pages/concept/conquest-desire'))
  unblockFirstArticle()
  await (await late).finished()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.locator('.wiki-reader-title-text').filter({ hasText: /^生命力$/ }).waitFor()
  assert.equal(await page.locator('.wiki-reader-title-text').innerText(), '生命力')
  pass('A late response from an earlier article does not replace the latest article selected through native links')
  await page.screenshot({ path: out + '/latest-article.png', animations: 'disabled' })
  await page.getByRole('tab', { name: /^文档/ }).click()
  await page.locator('.visual-knowledge-scroll[aria-busy="false"] :is(.visual-document-card,.visual-folder-card,.visual-document-row,.visual-folder-row)').first().waitFor()
  assert.equal(documentRequests, 1, 'The first documents-tab open must fetch its real list once')
  assert.equal(metadataRequests, 1)
  pass('The documents tab lazily loads its real cards in exactly one list request')
  await page.getByRole('tab', { name: 'Wiki', exact: true }).click()
  await page.locator('.wiki-reader-title-text').filter({ hasText: /^好奇心$/ }).waitFor()
  assert.equal(documentRequests, 1, 'Returning to Wiki must not fetch another document list')
  assert.equal(metadataRequests, 1)
  pass('Returning from documents restores the linked Wiki article without extra document or metadata reads')
  assert.deepEqual(errors, [])
  writeFileSync(out + '/acceptance.json', JSON.stringify({ accepted: true, origin, initialRequests, directoryRequests, statsRequests, metadataRequests, documentRequests, checks, errors, dataWrites: false }, null, 2))
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {})
  writeFileSync(out + '/acceptance.json', JSON.stringify({ accepted: false, origin, initialRequests, directoryRequests, statsRequests, metadataRequests, documentRequests, checks, errors, failure: error.message }, null, 2))
  throw error
} finally {
  unblockDirectory()
  unblockFirstArticle()
  await browser.close()
}
