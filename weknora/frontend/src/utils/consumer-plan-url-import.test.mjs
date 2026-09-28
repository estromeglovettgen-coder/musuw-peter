import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./consumerPlanError.ts', import.meta.url), 'utf8')

// The knowledge-base URL picker is visible in Lite today, but the server
// treats URL imports as a paid capability. Once the server rejects a Free
// request, the shared request interceptor must turn that exact denial into a
// user-facing upgrade message instead of the generic "URL import failed".
// Keep this red until the existing consumer-plan error mapping/locales carry
// the URL-import denial.
test('Free URL import denial has an explicit upgrade mapping', () => {
  assert.match(source, /'Free plan does not support URL import'\s*:\s*'entitlement\.freeUrlImport'/)
})
