import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./request.ts', import.meta.url), 'utf8')

test('a temporary refresh failure preserves browser tokens instead of restarting OIDC', () => {
  const transientGuard = source.indexOf('if (!isDefinitiveNativeSessionFailure(refreshError?.status))')
  const tokenClear = source.indexOf("localStorage.removeItem('weknora_token')", transientGuard)

  assert.notEqual(transientGuard, -1, 'refresh handling must distinguish transient failures')
  assert.notEqual(tokenClear, -1, 'definitive refresh failure must still clear a rejected session')
  assert.ok(transientGuard < tokenClear, 'temporary refresh failures must return before token cleanup')
})
