// Opt-in acceptance against the jointly deployed Peter frontend and backend.
// Run only after deployment: node e2e/peter/server-peter-surface.mjs --run
// Account and browser dependencies remain in the ignored deployment runtime.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium, request as playwrightRequest } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'

if (!process.argv.includes('--run')) {
  console.log('Live Peter surface acceptance requires --run after the matching frontend and backend are deployed.')
  process.exit(0)
}

const runtime = fileURLToPath(new URL('../../.runtime/peter/deployment/', import.meta.url))
const origin = process.env.PETER_ACCEPTANCE_ORIGIN || 'https://62.234.188.55'
const account = JSON.parse(readFileSync(`${runtime}/account.json`, 'utf8'))
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const prefix = `Peter 表面验收 ${runId}`
const reportPath = `${runtime}/surface-acceptance-${runId}.json`
const report = { at: new Date().toISOString(), origin, runId, checks: [], documents: [], cleanup: [] }
const createdIds = new Set()
const pageErrors = []
let browser
let apiContext
let page

function pass(name, details = {}) {
  report.checks.push({ name, ...details })
  console.log(`PASS ${name}`)
}

async function api(path, method = 'GET', data) {
  const response = await apiContext.fetch(path, {
    method,
    ...(data === undefined ? {} : { data }),
    timeout: 180_000,
  })
  const value = await response.json().catch(() => ({}))
  if (!response.ok() || value.success === false) {
    // Never print a payload or server error detail: model records may contain credentials.
    throw new Error(`${method} ${path}: HTTP ${response.status()}, code ${value.error?.code || value.code || 'request_failed'}`)
  }
  return value.data
}

async function upload(kbId, name, mimeType, buffer) {
  const response = await apiContext.post(`/api/v1/knowledge-bases/${kbId}/knowledge/file`, {
    multipart: { file: { name, mimeType, buffer } }, timeout: 180_000,
  })
  const value = await response.json().catch(() => ({}))
  if (!response.ok() || value.success === false || !value.data?.id) {
    throw new Error(`upload ${name}: HTTP ${response.status()}, code ${value.error?.code || value.code || 'request_failed'}`)
  }
  return value.data.id
}

function assertProcessingDefaults(value, models, label) {
  assert.equal(value.type, 'document', `${label}: document type`)
  assert.equal(value.vlm_config?.enabled, true, `${label}: image understanding enabled`)
  assert.equal(value.asr_config?.enabled, true, `${label}: audio transcription enabled`)
  assert.equal(value.indexing_strategy?.graph_enabled, true, `${label}: graph index enabled`)
  assert.equal(value.extract_config?.enabled, true, `${label}: graph extraction enabled`)
  assert.ok(value.extract_config?.nodes?.length > 0, `${label}: graph node schema`)
  assert.ok(value.extract_config?.relations?.length > 0, `${label}: graph relation schema`)
  for (const [id, type, field] of [
    [value.vlm_config?.model_id, 'VLLM', 'vlm_config.model_id'],
    [value.asr_config?.model_id, 'ASR', 'asr_config.model_id'],
    [value.summary_model_id, 'KnowledgeQA', 'summary_model_id'],
  ]) {
    assert.ok(id, `${label}: ${field} is present`)
    assert.ok(models.some(model => model.id === id && model.type === type && (!model.status || model.status === 'active')),
      `${label}: ${field} resolves to an active ${type} model`)
  }
  assert.equal(value.image_processing_config?.model_id, value.vlm_config.model_id,
    `${label}: image processing uses the selected vision model`)
  if (value.indexing_strategy?.vector_enabled || value.indexing_strategy?.keyword_enabled) {
    assert.ok(models.some(model => model.id === value.embedding_model_id && model.type === 'Embedding' && (!model.status || model.status === 'active')),
      `${label}: retrieval uses an active embedding model`)
  }
}

async function checkCreateResponse(response, expectedName, customer, models) {
  const payload = response.request().postDataJSON()
  const value = await response.json()
  assert.ok(response.ok() && value.success !== false && value.data?.id, `${expectedName}: create response`)
  createdIds.add(value.data.id)
  assert.equal(payload.name, expectedName)
  assert.equal(Boolean(payload.customer_profile), customer)
  assertProcessingDefaults(payload, models, `${expectedName} POST`)
  const persisted = await api(`/api/v1/knowledge-bases/${value.data.id}`)
  assert.equal(persisted.name, expectedName)
  assert.equal(Boolean(persisted.customer_profile), customer)
  assertProcessingDefaults(persisted, models, `${expectedName} GET`)
  assert.equal(persisted.vlm_config.model_id, payload.vlm_config.model_id)
  assert.equal(persisted.asr_config.model_id, payload.asr_config.model_id)
  assert.deepEqual(persisted.indexing_strategy, payload.indexing_strategy)
  pass(`${customer ? 'Customer' : 'Knowledge base'} create request and GET retain active image/audio/graph defaults`, { kbId: value.data.id })
  return value.data.id
}

async function navIsBusinessOnly(dialog, expected) {
  const actual = (await dialog.locator('.visual-settings-nav__item').allTextContents()).map(value => value.trim())
  assert.deepEqual(actual, expected, 'new-resource navigation must contain only business sections')
  const forbidden = ['向量存储', '存储引擎', '解析引擎', '分块设置', '高级设置', '图像处理', '音频处理', '知识图谱']
  for (const label of forbidden) {
    assert.equal(await dialog.locator('.visual-settings-nav__item', { hasText: label }).count(), 0, `${label} navigation is hidden`)
  }
}

async function waitForDocument(id, label) {
  const deadline = Date.now() + 12 * 60_000
  let document
  while (Date.now() < deadline) {
    document = await api(`/api/v1/knowledge/${id}`)
    if (document.parse_status === 'completed') break
    if (document.parse_status === 'failed') {
      throw new Error(`${label} processing failed; inspect the document's server-side status`)
    }
    await delay(10_000)
  }
  assert.equal(document?.parse_status, 'completed', `${label} did not complete within 12 minutes`)
  const chunks = await api(`/api/v1/chunks/${id}?page=1&page_size=100&chunk_type=text&chunk_type=image_ocr&chunk_type=image_caption`)
  assert.ok(Array.isArray(chunks) && chunks.some(chunk => String(chunk.content || '').trim()), `${label}: parsed text chunks`)
  report.documents.push({ label, id, status: 'completed', chunks: chunks.length })
  pass(`${label} completed with nonempty parsed chunks`, { documentId: id, chunks: chunks.length })
  return chunks
}

async function assertRetrievable(kbId, documentId, query, label) {
  const results = await api(`/api/v1/knowledge-bases/${kbId}/hybrid-search`, 'POST', {
    query_text: query, knowledge_ids: [documentId], match_count: 10,
    vector_threshold: 0, keyword_threshold: 0,
  })
  assert.ok(Array.isArray(results) && results.some(hit => hit.knowledge_id === documentId), `${label}: hybrid search returns the uploaded document`)
  pass(`${label} is retrievable`, { documentId, matches: results.length })
}

async function cleanup() {
  if (!apiContext) return
  // The name is unique to this run. Discover creations even if the browser
  // received the POST response but Playwright was interrupted before recording its ID.
  try {
    const rows = await api('/api/v1/knowledge-bases')
    for (const row of rows || []) if (row.name?.startsWith(prefix)) createdIds.add(row.id)
  } catch (error) {
    report.cleanup.push({ action: 'discover', error: error.message })
  }
  for (const id of createdIds) {
    try {
      await api(`/api/v1/knowledge-bases/${id}`, 'DELETE')
      report.cleanup.push({ kbId: id, deleted: true })
    } catch (error) {
      report.cleanup.push({ kbId: id, deleted: false, error: error.message })
    }
  }
  try {
    const remaining = (await api('/api/v1/knowledge-bases')).filter(row => row.name?.startsWith(prefix))
    if (remaining.length) report.cleanup.push({ action: 'verify', deleted: false, remainingIds: remaining.map(row => row.id) })
  } catch (error) {
    report.cleanup.push({ action: 'verify', deleted: false, error: error.message })
  }
}

let failure
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true })
  page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.name || 'Error'))
  await page.addLocatorHandler(page.getByRole('button', { name: '跳过引导', exact: true }).first(), button => button.click())
  await page.goto(`${origin}/login?lang=zh-CN`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(account.email)
  await page.locator('#password').fill(account.password)
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/platform/**', { timeout: 60_000 })
  const token = await page.evaluate(() => localStorage.getItem('weknora_token'))
  assert.ok(token, 'browser login issued a token')
  apiContext = await playwrightRequest.newContext({ baseURL: origin, ignoreHTTPSErrors: true,
    extraHTTPHeaders: { authorization: `Bearer ${token}`, 'Accept-Language': 'zh-CN' } })
  const models = await api('/api/v1/models')
  assert.ok(Array.isArray(models), 'model inventory is available')

  const kbName = `${prefix} 知识库`
  await page.goto(`${origin}/platform/knowledge-bases`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新建知识库', exact: true }).first().click()
  const kbDialog = page.getByRole('dialog', { name: '新建知识库' })
  await kbDialog.getByPlaceholder('请输入知识库名称').waitFor()
  await kbDialog.locator('[data-guide="kb-create-submit"]:not([disabled])').waitFor()
  await navIsBusinessOnly(kbDialog, ['基本信息', '模型配置'])
  assert.equal(await page.locator('.guide__card').count(), 0, 'Peter creation has no obsolete technical tour')
  await kbDialog.getByPlaceholder('请输入知识库名称').fill(kbName)
  await kbDialog.getByPlaceholder('请输入知识库描述（可选）').fill('虚构图像、语音和图谱验收；运行后清理。')
  const [kbCreated] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/knowledge-bases' && response.request().method() === 'POST', { timeout: 20_000 }),
    kbDialog.locator('[data-guide="kb-create-submit"]').click(),
  ])
  const kbId = await checkCreateResponse(kbCreated, kbName, false, models)
  pass('New knowledge-base form shows the business fields and hides technical navigation')

  const customerName = `${prefix} 客户`
  await page.goto(`${origin}/platform/customers`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新建客户', exact: true }).first().click()
  const customerDialog = page.getByRole('dialog', { name: '新建客户' })
  await customerDialog.getByPlaceholder('例如：Alex').waitFor()
  await customerDialog.locator('[data-guide="kb-create-submit"]:not([disabled])').waitFor()
  await navIsBusinessOnly(customerDialog, ['客户资料', '聊天资料', 'Wiki 与检索', '模型配置'])
  await customerDialog.getByPlaceholder('例如：Alex').fill(customerName)
  await customerDialog.getByPlaceholder('目前的情况或关注点').fill('虚构客户，验证默认图像、语音和实体关系提取。')
  await customerDialog.getByPlaceholder('需要持续保留的背景或注意事项').fill('仅为自动验收创建，运行后清理。')
  const [customerCreated] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/knowledge-bases' && response.request().method() === 'POST', { timeout: 20_000 }),
    customerDialog.locator('[data-guide="kb-create-submit"]').click(),
  ])
  const customerId = await checkCreateResponse(customerCreated, customerName, true, models)
  pass('New customer form shows the business fields and hides technical navigation')

  const customerMdCode = `CUSTOMER-${runId.toUpperCase()}`
  const customerMd = Buffer.from(`# 虚构客户资料\n\n客户林然负责星河项目，星河项目使用蓝图工具整理资料。客户确认码 ${customerMdCode}。\n`)
  const customerDoc = await upload(customerId, `customer-${runId}.md`, 'text/markdown', customerMd)
  const customerChunks = await waitForDocument(customerDoc, 'customer Markdown')
  assert.match(customerChunks.map(chunk => chunk.content).join('\n'), new RegExp(customerMdCode))

  const mdCode = `KNOWLEDGE-${runId.toUpperCase()}`
  const md = Buffer.from(`# 星河项目验收\n\n林然负责星河项目，星河项目使用蓝图工具整理资料。公共知识库确认码 ${mdCode}。\n`)
  const mdDoc = await upload(kbId, `graph-${runId}.md`, 'text/markdown', md)
  const mdChunks = await waitForDocument(mdDoc, 'knowledge-base Markdown and graph extraction')
  assert.match(mdChunks.map(chunk => chunk.content).join('\n'), new RegExp(mdCode))
  await assertRetrievable(kbId, mdDoc, mdCode, 'Markdown')

  const image = readFileSync(`${runtime}/alex-image.png`)
  const imageDoc = await upload(kbId, `synthetic-image-${runId}.png`, 'image/png', image)
  const imageChunks = await waitForDocument(imageDoc, 'synthetic image')
  assert.match(imageChunks.map(chunk => chunk.content).join('\n'), /IMG\s*[-–—]?\s*4582/i,
    'vision output must read the synthetic image code')
  await assertRetrievable(kbId, imageDoc, 'IMG-4582', 'Image description')

  const wav = readFileSync(fileURLToPath(new URL('../../weknora/internal/assets/asr_test.wav', import.meta.url)))
  const wavDoc = await upload(kbId, `synthetic-audio-${runId}.wav`, 'audio/wav', wav)
  const wavChunks = await waitForDocument(wavDoc, 'WAV transcription')
  const transcript = wavChunks.map(chunk => String(chunk.content || '')).join(' ').trim()
  assert.ok(transcript.length > 12, 'WAV must produce a nontrivial transcript')
  assert.doesNotMatch(transcript, /No speech detected in audio file/i, 'WAV must contain recognized speech')
  await assertRetrievable(kbId, wavDoc, transcript.slice(0, 80), 'WAV transcription')

  assert.deepEqual(pageErrors, [], 'browser has no uncaught errors')
} catch (error) {
  const rawMessage = String(error.message || error)
  const safeMessage = account.password ? rawMessage.replaceAll(account.password, '[redacted]') : rawMessage
  failure = new Error(safeMessage)
  report.failure = { message: safeMessage }
  if (page) await page.screenshot({ path: `${runtime}/surface-acceptance-${runId}-failure.png`, fullPage: true }).catch(() => undefined)
} finally {
  await cleanup()
  if (apiContext) await apiContext.dispose()
  if (browser) await browser.close()
  report.pageErrors = pageErrors
  report.status = failure || report.cleanup.some(item => item.deleted === false || item.error) ? 'failed' : 'passed'
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(`Acceptance report: ${reportPath}`)
}
if (failure) throw failure
assert.ok(report.cleanup.length >= 2 && report.status === 'passed', 'temporary acceptance knowledge bases were not fully cleaned up')
