import assert from 'node:assert/strict'
import test from 'node:test'
import { createDiagnosticReporter } from '../../../../shared/client-diagnostics.ts'

const uuid = '9b7658e8-bf24-4f91-8194-2620ba574e71'
function fixture(overrides = {}) {
  const calls = []
  const values = new Map()
  const options = {
    fetch: async (...args) => { calls.push(args); return new Response(null, { status: 204 }) },
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, val) => values.set(key, val) },
    now: () => 1000, randomUUID: () => uuid, ...overrides,
  }
  return { report: createDiagnosticReporter(options), calls, options, values }
}
const event = { phase: 'auth.otp_verify', outcome: 'ok', duration_ms: 125 }

test('sends only allowlisted metadata, never raw extras or ambient credentials/referrer', () => {
  const { report, calls } = fixture()
  report({ ...event, password: 'secret', email: 'private@example.test', url: '/?code=secret' })
  assert.equal(calls.length, 1)
  const [url, options] = calls[0]
  assert.equal(url, '/api/v1/client-diagnostics')
  assert.deepEqual(JSON.parse(options.body), { ...event, flow_id: uuid })
  assert.equal(options.credentials, 'omit')
  assert.equal(options.referrerPolicy, 'no-referrer')
  assert.equal(options.mode, 'same-origin')
})
test('rejects unsafe values and caps page traffic', () => {
  const { report, calls } = fixture()
  for (const patch of [{ phase: 'private@example.test' }, { outcome: 'secret' }, { duration_ms: NaN }, { duration_ms: -1 }, { duration_ms: 120001 }, { request_id: 'token=secret' }]) report({ ...event, ...patch })
  assert.equal(calls.length, 0)
  for (let i = 0; i < 60; i++) report(event)
  assert.equal(calls.length, 40)
})
test('storage and transport failures never throw or retry', async () => {
  let attempts = 0
  const { report } = fixture({
    storage: { getItem() { throw Error('disabled') }, setItem() { throw Error('disabled') } },
    fetch: async () => { attempts++; throw Error('unreachable') },
  })
  assert.doesNotThrow(() => report(event))
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(attempts, 1)
})
test('correlation survives same-tab navigation but expires after ten minutes', () => {
  const { report, options, calls } = fixture()
  report(event)
  const next = createDiagnosticReporter({ ...options, randomUUID: () => 'ef3e9b35-a9c0-4d06-950f-356da2e6fb3c' })
  next(event)
  assert.equal(JSON.parse(calls[1][1].body).flow_id, uuid)
  createDiagnosticReporter({ ...options, now: () => 602000, randomUUID: () => 'ef3e9b35-a9c0-4d06-950f-356da2e6fb3c' })(event)
  assert.notEqual(JSON.parse(calls[2][1].body).flow_id, uuid)
})
