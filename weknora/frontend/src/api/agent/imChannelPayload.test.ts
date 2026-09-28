import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildIMChannelCredentialsPatch,
  buildIMChannelUpdatePayload,
} from './imChannelPayload'

const baseUpdate = {
  name: 'Support bot',
  mode: 'websocket' as const,
  output_mode: 'stream' as const,
  session_mode: 'user' as const,
  knowledge_base_id: 'kb-1',
  enabled: true,
  agent_id: 'agent-1',
}

test('editing channel metadata omits untouched write-only credentials', () => {
  const credentials = { app_id: '', app_secret: '', post_to_main: false }
  const patch = buildIMChannelCredentialsPatch(credentials, { ...credentials })
  const payload = buildIMChannelUpdatePayload(baseUpdate, patch)

  assert.deepEqual(payload, baseUpdate)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'credentials'), false)
})

test('credential patch includes only changed keys instead of sparse form defaults', () => {
  const initial = {
    api_base_url: '',
    app_id: '',
    app_secret: '',
    post_to_main: false,
  }
  const current = { ...initial, api_base_url: 'https://api.example.com' }

  assert.deepEqual(buildIMChannelCredentialsPatch(initial, current), {
    api_base_url: 'https://api.example.com',
  })
})

test('false, zero, and empty string are retained as explicit credential changes', () => {
  const patch = buildIMChannelCredentialsPatch({}, {
    post_to_main: false,
    timeout_seconds: 0,
    app_secret: '',
  })

  assert.deepEqual(patch, {
    post_to_main: false,
    timeout_seconds: 0,
    app_secret: '',
  })
  assert.deepEqual(buildIMChannelUpdatePayload(baseUpdate, patch), {
    ...baseUpdate,
    credentials: patch,
  })
})

test('changing one secret does not send any other default credential field', () => {
  const initial = { app_id: '', app_secret: '', verification_token: '' }
  const patch = buildIMChannelCredentialsPatch(initial, {
    ...initial,
    app_secret: 'replacement-secret',
  })

  assert.deepEqual(patch, { app_secret: 'replacement-secret' })
})

test('wechat rebinding sends every credential returned by the QR flow', () => {
  const credentials = {
    bot_token: 'new-token',
    ilink_bot_id: 'new-bot',
    ilink_user_id: 'new-user',
  }
  const patch = buildIMChannelCredentialsPatch({}, credentials)
  const payload = buildIMChannelUpdatePayload(baseUpdate, patch)

  assert.deepEqual(payload, { ...baseUpdate, credentials })
})
