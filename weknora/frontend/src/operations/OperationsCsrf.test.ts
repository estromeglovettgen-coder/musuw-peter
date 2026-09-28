import assert from 'node:assert/strict'
import test from 'node:test'
import { operationsCsrfToken } from './csrf'

test('CSRF cookie selection is isolated by the fixed console port', () => {
  const cookies = [
    'musuw_admin_csrf_test=test-token',
    'musuw_admin_csrf_production=production-token',
    'musuw_admin_csrf=legacy-token',
  ].join('; ')

  assert.equal(operationsCsrfToken(cookies, '4186'), 'test-token')
  assert.equal(operationsCsrfToken(cookies, '4187'), 'production-token')
})

test('the opposite target cookie is never used and blocks an ambiguous legacy fallback', () => {
  assert.equal(
    operationsCsrfToken('musuw_admin_csrf_production=production-token; musuw_admin_csrf=legacy-token', '4186'),
    '',
  )
  assert.equal(
    operationsCsrfToken('musuw_admin_csrf_test=test-token; musuw_admin_csrf=legacy-token', '4187'),
    '',
  )
})

test('legacy CSRF cookie is accepted only when no target-specific cookie exists', () => {
  assert.equal(operationsCsrfToken('musuw_admin_csrf=legacy%20token', '4186'), 'legacy token')
  assert.equal(operationsCsrfToken('musuw_admin_csrf=legacy-token', '4187'), 'legacy-token')
  assert.equal(operationsCsrfToken('musuw_admin_csrf_test=test-token', ''), '')
})
