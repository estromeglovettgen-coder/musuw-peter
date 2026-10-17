import assert from 'node:assert/strict'
import test from 'node:test'
import { httpErrorMessageKey } from './httpErrorMessage'

test('HTTP gateway errors expose useful messages instead of nginx HTML', () => {
  assert.equal(httpErrorMessageKey(400, '<html><head><title>400 Request Header Or Cookie Too Large</title></head></html>'), 'error.requestHeadersTooLarge')
  assert.equal(httpErrorMessageKey(431, ''), 'error.requestHeadersTooLarge')
  assert.equal(httpErrorMessageKey(502, '<html><body>502 Bad Gateway</body></html>'), 'error.serverUnavailable')
  assert.equal(httpErrorMessageKey(400, '请填写目标名称'), undefined)
  assert.equal(httpErrorMessageKey(403, 'Forbidden'), undefined)
})
