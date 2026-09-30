// Opt-in live acceptance. Uses only the isolated demo tenant and synthetic CSV.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const origin = process.env.PETER_ACCEPTANCE_ORIGIN || 'https://62.234.188.55'
const output = '.runtime/peter/deployment'
const account = JSON.parse(readFileSync(`${output}/demo-account.json`, 'utf8'))

async function request(token, path, method = 'GET', body) {
  const form = body instanceof FormData
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || form ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(240_000),
  })
  return response
}

async function api(token, path, method = 'GET', body) {
  const response = await request(token, path, method, body)
  const payload = await response.json().catch(() => ({}))
  assert.ok(response.ok && payload.success !== false, `${method} ${path}: HTTP ${response.status}`)
  return payload.data
}

const login = await request('', '/api/v1/auth/login', 'POST', account)
assert.equal(login.status, 200)
const token = (await login.json()).token
assert.ok(token)

const agents = await api(token, '/api/v1/agents')
const source = agents.find((agent) => agent.name === '客户分析验收助手')
  || agents.find((agent) => agent.name === '客户报表助手（演示）')
assert.ok(source, 'the demo fixture agent must exist')
const copy = await api(token, `/api/v1/agents/${source.id}/copy`, 'POST', {})
let sessionId = ''
let browser
const checks = []

try {
  await api(token, `/api/v1/agents/${copy.id}`, 'PUT', {
    name: 'Skill 界面验收临时助手',
    description: '仅处理虚构 CSV，验收后删除。',
    config: {
      ...copy.config,
      agent_mode: 'smart-reasoning',
      agent_type: 'custom',
      system_prompt: '用户请求 customer-report 时，先阅读并执行该技能。必须真实运行脚本，不要心算或伪造文件。',
      max_iterations: 8,
      max_completion_tokens: 2000,
      kb_selection_mode: 'none',
      knowledge_bases: [],
      allowed_tools: [],
      skills_selection_mode: 'none',
      selected_skills: [],
      sandbox_config_id: '',
    },
  })

  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({
    locale: 'zh-CN', viewport: { width: 1440, height: 1000 },
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'weknora_token', value: token }] }] },
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addLocatorHandler(page.getByRole('button', { name: '跳过引导', exact: true }).first(), (button) => button.click())

  await page.goto(`${origin}/platform/settings?section=skills`, { waitUntil: 'domcontentloaded' })
  await page.getByText('添加技能后，在智能体的「技能」页勾选即可使用。').waitFor({ timeout: 60000 })
  await page.getByText('当前工作区', { exact: true }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: '去配置沙箱' }).count(), 0)
  checks.push('Skill directory explains install then agent selection; no hidden sandbox link')

  await page.goto(`${origin}/platform/agents?edit=${copy.id}&section=skills`, { waitUntil: 'domcontentloaded' })
  const customerReport = page.locator('.skill-pick').filter({ hasText: 'customer-report' })
  await customerReport.waitFor({ timeout: 60000 })
  assert.ok(await page.locator('.skill-pick').count() >= 2)
  assert.equal(await page.locator('.sandbox-config-select:visible').count(), 0)
  assert.equal(await page.locator('.agent-scope-select:visible').count(), 0)
  await customerReport.locator('.skill-pick__check').click()
  await page.getByRole('button', { name: '保存并关闭' }).click()
  await page.locator('.skill-pick').first().waitFor({ state: 'hidden', timeout: 60000 })
  const saved = await api(token, `/api/v1/agents/${copy.id}`)
  const sandboxes = await api(token, '/api/v1/sandbox-configs')
  const soleSandbox = (Array.isArray(sandboxes) ? sandboxes : sandboxes.configs)[0]
  assert.ok(soleSandbox, 'the demo tenant needs its persisted sandbox')
  assert.equal(saved.config.skills_selection_mode, 'selected')
  assert.deepEqual(saved.config.selected_skills, ['customer-report'])
  assert.equal(saved.config.sandbox_config_id, soleSandbox.id)
  assert.deepEqual(pageErrors, [])
  checks.push('One click selects a ready skill and saves the sole sandbox binding')

  sessionId = (await api(token, '/api/v1/sessions', 'POST', { title: 'Skill UI 虚构 CSV 验收' })).id
  const upload = new FormData()
  upload.set('file', new Blob(['customer,followups\nAlex,3\nBen,4\nCasey,5\n']), 'skill-ui-followups.csv')
  upload.set('agent_id', copy.id)
  const attachment = await api(token, `/api/v1/sessions/${sessionId}/attachments`, 'POST', upload)
  const stream = await request(token, `/api/v1/agent-chat/${sessionId}`, 'POST', {
    query: '请用 customer-report 技能处理上传的 skill-ui-followups.csv，执行脚本生成 /workspace/output/customer-report.json，并给出下载链接。',
    agent_id: copy.id, agent_enabled: true, disable_title: true, channel: 'web',
    attachment_ids: [attachment.id],
  })
  assert.equal(stream.status, 200)
  const events = (await stream.text()).split('\n').filter((line) => line.startsWith('data:')).map((line) => {
    try { return JSON.parse(line.slice(5)) } catch { return {} }
  })
  assert.ok(!events.some((event) => event.response_type === 'error'), 'skill chat emitted an error')
  const artifacts = await api(token, `/api/v1/sessions/${sessionId}/artifacts`)
  assert.equal(artifacts.length, 1, 'skill must produce one real artifact')
  const messageId = events.find((event) => event.response_type === 'agent_query')?.assistant_message_id
  assert.ok(messageId)
  const file = await request(token, `/api/v1/sessions/${sessionId}/messages/${messageId}/artifacts/0/download`)
  assert.equal(file.status, 200)
  assert.deepEqual(JSON.parse(await file.text()), { customers: 3, followups: 12, names: ['Alex', 'Ben', 'Casey'] })
  checks.push('Selected Skill executes and its generated file downloads with verified content')

  writeFileSync(`${output}/skill-ui-acceptance.json`, JSON.stringify({ at: new Date().toISOString(), checks }, null, 2), { mode: 0o600 })
  console.log(checks.map((check) => `PASS ${check}`).join('\n'))
} finally {
  if (browser) await browser.close()
  if (sessionId) {
    await api(token, `/api/v1/sessions/${sessionId}`, 'DELETE')
      .catch((error) => console.error('Could not remove the demo session:', error.message))
  }
  await api(token, `/api/v1/agents/${copy.id}`, 'DELETE')
    .catch((error) => console.error('Could not remove the demo agent:', error.message))
}
