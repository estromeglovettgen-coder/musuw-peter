import assert from 'node:assert/strict'
import test from 'node:test'
import { installRequestDiagnostics } from './requestDiagnostics.ts'

test('records slow documents and auth failures with safe phase/request metadata only', async () => {
  let request, response, failure
  let now = 0
  const events = []
  installRequestDiagnostics({ interceptors: {
    request: { use(fn) { request = fn } },
    response: { use(ok, fail) { response = ok; failure = fail } },
  } }, event => events.push(event), () => now)
  const config = { url: '/api/v1/knowledge/private-document?text=secret', headers: { 'X-Request-ID': 'abc_123' } }
  assert.equal(request(config), config)
  now = 2100
  const payload = { config, status: 200, data: { text: 'private document body' } }
  assert.equal(response(payload), payload)
  assert.deepEqual(events, [{ phase: 'api.documents', outcome: 'ok', duration_ms: 2100, status: 200, request_id: 'abc_123' }])
  const auth = { url: '/api/v1/auth/me', headers: { 'X-Request-ID': 'def_456' } }
  request(auth)
  now += 30000
  const error = { config: auth, code: 'ECONNABORTED', message: 'secret provider message' }
  await assert.rejects(failure(error), e => e === error)
  assert.deepEqual(events[1], { phase: 'api.auth', outcome: 'timeout', duration_ms: 30000, status: 0, request_id: 'def_456' })
  assert.ok(!JSON.stringify(events).includes('secret'))
})
test('ignores fast documents, unrelated APIs, cancellations and reporting failures', async () => {
  let request, response, failure
  let calls = 0
  installRequestDiagnostics({ interceptors: {
    request: { use(fn) { request = fn } }, response: { use(ok, fail) { response = ok; failure = fail } },
  } }, () => { calls++; throw Error('unreachable') }, () => 0)
  for (const url of ['/api/v1/knowledge/abc', '/api/v1/billing/anything', '/api/v1/client-diagnostics']) {
    const config = { url, headers: {} }; request(config); response({ config, status: 200 })
  }
  assert.equal(calls, 0)
  const config = { url: '/api/v1/auth/me', headers: {} }; request(config)
  await assert.rejects(failure({ config, code: 'ERR_CANCELED' }))
  assert.equal(calls, 0)
  assert.doesNotThrow(() => response({ config, status: 200 }))
  assert.equal(calls, 1)
})
