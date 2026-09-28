import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { resolveCanManageChannels } from './channelAccess'

const authStoreSource = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8')

test('every valid tenant member can manage IM and embed channels', () => {
  for (const role of ['viewer', 'contributor', 'admin', 'owner']) {
    assert.equal(resolveCanManageChannels(role, false), true, role)
  }
})

test('channel management fails closed without membership but allows cross-tenant superusers', () => {
  assert.equal(resolveCanManageChannels('', false), false)
  assert.equal(resolveCanManageChannels('unexpected', false), false)
  assert.equal(resolveCanManageChannels('', true), true)
})

test('the auth store exposes the shared channel capability', () => {
  assert.match(authStoreSource, /const canManageChannels = computed\(/)
  assert.match(authStoreSource, /canManageChannels,/)
})
