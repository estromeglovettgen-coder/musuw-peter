// Explicit live acceptance, never included in the offline unit-test command.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

export const runtime = '.runtime/peter/deployment'
mkdirSync(runtime, { recursive: true })
export const origin = process.env.PETER_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:18287'
export const account = JSON.parse(readFileSync(`${runtime}/account.json`, 'utf8'))
export const state = existsSync(`${runtime}/state.json`) ? JSON.parse(readFileSync(`${runtime}/state.json`, 'utf8')) : {}
let token = ''
export function save() { writeFileSync(`${runtime}/state.json`, JSON.stringify(state, null, 2), { mode: 0o600 }) }
export function record(name, details = {}) {
  state.checks ||= []
  state.checks.push({ name, at: new Date().toISOString(), ...details })
  save()
  console.log(`PASS ${name}`)
}
export async function request(path, method = 'GET', body, options = {}) {
  const multipart = body instanceof FormData
  return fetch(origin + path, {
    method,
    headers: { ...(multipart ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), 'Accept-Language': 'zh-CN' },
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(180_000), ...options,
  })
}
export async function api(path, method = 'GET', body) {
  const response = await request(path, method, body)
  const value = await response.json()
  if (!response.ok || value.success === false) {
    // Do not dump payloads: a model-create request contains the provider key.
    throw new Error(`${method} ${path}: HTTP ${response.status}; ${value.error?.code || value.code || 'request_failed'}; ${String(value.error?.message || value.message || '').slice(0, 300)}`)
  }
  return value
}
export async function login() {
  const result = await api('/api/v1/auth/login', 'POST', { email: account.email, password: account.password })
  token = result.token
  assert.ok(token, 'login must issue a token')
  return result
}
export async function upload(path, filename, bytes, fields = {}) {
  const body = new FormData()
  body.set('file', new Blob([bytes]), filename)
  for (const [key, value] of Object.entries(fields)) body.set(key, String(value))
  return api(path, 'POST', body)
}

export async function chat(sessionID, agentID, query, extra = {}) {
  const response = await request(`/api/v1/agent-chat/${sessionID}`, 'POST', {
    query, agent_id: agentID, agent_enabled: true, disable_title: true, channel: 'web', ...extra,
  })
  assert.ok(response.ok, `chat HTTP ${response.status}`)
  const stream = await response.text()
  writeFileSync(`${runtime}/chat-${sessionID}-${Date.now()}.sse`, stream, { mode: 0o600 })
  return stream
}
