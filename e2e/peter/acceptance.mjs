// Local acceptance only. Start npm run dev and the model fixture first.
// Auth credentials are read from the ignored local account file, never checked in.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const base = 'http://127.0.0.1:18187'
const fixture = 'http://127.0.0.1:19187'
const account = JSON.parse(readFileSync('.runtime/peter/preview-account.json'))
let token = ''
async function api(path, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) })
  const data = await r.json()
  assert.ok(r.ok && data.success !== false, `${method} ${path}: status ${r.status}`)
  return data
}
const login = await api('/api/v1/auth/login', 'POST', { email: account.email, password: account.password })
token = login.token
const models = (await api('/api/v1/models')).data
const model = models.find(m => m.name === 'peter-local-fixture')
assert.ok(model, 'Add the local fixture model in browser model management before acceptance')
for (const m of models) {
  assert.equal(m.parameters.api_key, undefined, 'normal model reads must never disclose provider credentials')
  assert.equal(m.parameters.app_secret, undefined)
}
assert.equal(model.credentials.api_key.configured, true)
const browserAgent = (await api('/api/v1/agents')).data.find(a => a.name === 'Peter 本地验收助手')
assert.ok(browserAgent, 'Create the browser acceptance agent first')
assert.equal(browserAgent.config.max_completion_tokens, 777)
assert.match(browserAgent.config.system_prompt, /PETER_UI_ACCEPTANCE/)
assert.equal(browserAgent.config.model_id, model.id)
for (const path of ['/api/v1/skills', '/api/v1/skills/catalog', '/api/v1/agents/type-presets']) await api(path)
const checks = ['browser model and agent saved values', 'masked credential reads', 'native agent resource APIs']
for (const mode of ['quick-answer', 'smart-reasoning']) {
  const marker = `PETER_RUNTIME_${mode}`
  const prompt = `${marker}. You are a local acceptance assistant. Reply briefly to the user.`
  const config = { ...browserAgent.config,
    agent_mode: mode, agent_type: 'custom', model_id: model.id, query_understand_model_id: model.id,
    temperature: 0.2, max_completion_tokens: 333, max_iterations: 2, thinking: false,
    system_prompt: prompt, system_prompt_id: '', context_template: '{{query}}\n{{contexts}}',
    intent_prompts: Object.fromEntries(['greeting', 'chitchat', 'follow_up', 'summarize', 'fallback', 'image_only', 'doc_only', 'web_search_disabled'].map(k => [k, prompt])),
    fallback_prompt: `${prompt}\n{{query}}`, fallback_strategy: 'model',
    kb_selection_mode: 'none', knowledge_bases: [], allowed_tools: [], mcp_selection_mode: 'none', skills_selection_mode: 'none',
    enable_rewrite: false, enable_query_expansion: false, memory_enabled: false,
    web_search_enabled: false, web_fetch_enabled: false,
    question_suggestions: { starters: { enabled: false, items: [] }, follow_ups: { enabled: false } },
  }
  let agent = (await api('/api/v1/agents', 'POST', { name: `Acceptance ${mode}`, config })).data
  const session = (await api('/api/v1/sessions', 'POST', { title: `Local ${mode} acceptance` })).data
  let copy
  try {
    agent = (await api(`/api/v1/agents/${agent.id}`, 'PUT', { name: `Acceptance ${mode} edited`, config: { ...agent.config, history_turns: 7 } })).data
    const loaded = (await api(`/api/v1/agents/${agent.id}`)).data
    assert.equal(loaded.config.history_turns, 7)
    assert.equal(loaded.config.temperature, 0.2)
    copy = (await api(`/api/v1/agents/${agent.id}/copy`, 'POST', {})).data
    assert.equal(copy.config.system_prompt, loaded.config.system_prompt)
    const before = (await (await fetch(`${fixture}/requests`)).json()).length
    const r = await fetch(`${base}/api/v1/${mode === 'smart-reasoning' ? 'agent-chat' : 'knowledge-chat'}/${session.id}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: '用一句话描述这个测试的目的。', agent_id: agent.id, agent_enabled: mode === 'smart-reasoning', disable_title: true, channel: 'web' }), signal: AbortSignal.timeout(45000),
    })
    assert.ok(r.ok, `chat response ${r.status}`)
    const stream = await r.text()
    assert.match(stream, /本地链路验收成功/)
    const calls = (await (await fetch(`${fixture}/requests`)).json()).slice(before).filter(x => x.path === '/v1/chat/completions')
    assert.ok(calls.some(x => JSON.stringify(x.body.messages).includes(marker)), `${mode} must consume configured prompt`)
    assert.ok(calls.some(x => x.body.temperature === 0.2 && (x.body.max_tokens === 333 || x.body.max_completion_tokens === 333)), `${mode} must consume configured generation parameters`)
    assert.ok(calls.every(x => x.body.model === model.name && x.authorized))
    checks.push(`${mode}: create/edit/reload/copy + authenticated model call, prompt, temperature and token limit`)
  } finally {
    if (copy) await api(`/api/v1/agents/${copy.id}`, 'DELETE')
    await api(`/api/v1/agents/${agent.id}`, 'DELETE')
    await api(`/api/v1/sessions/${session.id}`, 'DELETE')
  }
}
writeFileSync('.runtime/peter/acceptance-results.json', JSON.stringify({ at: new Date().toISOString(), checks }, null, 2))
console.log(checks.map(x => `PASS ${x}`).join('\n'))
