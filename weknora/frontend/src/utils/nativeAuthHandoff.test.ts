import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import * as nativeEntry from '../config/workspaceBrand.ts'

import {
  AUTHENTICATED_HOME_PATH,
  EXTERNAL_AUTH_ERROR_PATH,
  EXTERNAL_AUTH_LOGOUT_PATH,
  EXTERNAL_AUTH_START_PATH,
  hasOIDCErrorCallback,
  hasPendingOIDCCallback,
  handoffToExternalAuth,
  isDefinitiveNativeSessionFailure,
  usesNativeAuthentication,
} from './nativeAuthHandoff.ts'

test('signed-out private entry reaches the login shell before downloading the workspace', () => {
  const script = (nativeEntry as Record<string, unknown>).NATIVE_PASSWORD_ENTRY_BOOTSTRAP
  assert.equal(typeof script, 'string')
  const navigations: string[] = []
  const location = { pathname: '/', search: '?lang=zh-CN', hash: '', replace: (p: string) => navigations.push(p) }
  runInNewContext(script as string, { location, localStorage: { getItem: () => null } })
  assert.deepEqual(navigations, ['/auth/start?lang=zh-CN'])
  for (const patch of [{ hash: '#oidc_result=callback' }, { pathname: '/auth/callback' }]) {
    navigations.length = 0
    runInNewContext(script as string, { location: { ...location, ...patch }, localStorage: { getItem: () => null } })
    assert.deepEqual(navigations, [])
  }
  navigations.length = 0
  runInNewContext(script as string, { location, localStorage: { getItem: () => 'saved-token' } })
  assert.deepEqual(navigations, [])
  runInNewContext(script as string, { location, localStorage: { getItem: () => { throw Error('storage blocked') } } })
  assert.deepEqual(navigations, [])
})

test('private deployment uses the native login for sign-in, logout and expired sessions', () => {
  assert.equal(usesNativeAuthentication('native'), true)
  assert.equal(usesNativeAuthentication('external'), false)
  assert.equal(usesNativeAuthentication(''), false)
  const navigations: string[] = []
  for (const target of ['start', 'logout', 'error'] as const) {
    handoffToExternalAuth(target, { assign: (path) => navigations.push(String(path)) }, true)
  }
  assert.deepEqual(navigations, ['/login', '/login', '/login?error=authentication_failed'])
})

test('a signed-out native route hands the browser to the Musnow auth entry', () => {
  const navigations: string[] = []

  handoffToExternalAuth('start', { assign: (path) => navigations.push(String(path)) })

  assert.deepEqual(navigations, [EXTERNAL_AUTH_START_PATH])
  assert.equal(EXTERNAL_AUTH_START_PATH, '/auth/start')
})

test('an OIDC callback hash remains available for the existing callback handler', () => {
  assert.equal(hasPendingOIDCCallback('#oidc_result=eyJzdWNjZXNzIjp0cnVlfQ'), true)
  assert.equal(hasPendingOIDCCallback('#oidc_error=access_denied'), true)
  assert.equal(hasPendingOIDCCallback('#plain-fragment'), false)
})

test('an OIDC callback error is distinguished from a successful callback result', () => {
  assert.equal(hasOIDCErrorCallback('#oidc_error=temporary_database_unavailable'), true)
  assert.equal(hasOIDCErrorCallback('#oidc_result=eyJzdWNjZXNzIjp0cnVlfQ'), false)
  assert.equal(hasOIDCErrorCallback('#plain-fragment'), false)
})

test('only a definitive authorization response invalidates a native session', () => {
  assert.equal(isDefinitiveNativeSessionFailure(401), true)
  assert.equal(isDefinitiveNativeSessionFailure(403), true)
  assert.equal(isDefinitiveNativeSessionFailure(500), false)
  assert.equal(isDefinitiveNativeSessionFailure(503), false)
  assert.equal(isDefinitiveNativeSessionFailure(undefined), false)
})

test('native logout hands the browser to the Musnow session logout endpoint', () => {
  const navigations: string[] = []

  handoffToExternalAuth('logout', { assign: (path) => navigations.push(String(path)) })

  assert.deepEqual(navigations, [EXTERNAL_AUTH_LOGOUT_PATH])
  assert.equal(EXTERNAL_AUTH_LOGOUT_PATH, '/auth/logout')
})

test('a failed native callback hands the browser to an explicit retry page', () => {
  const navigations: string[] = []

  handoffToExternalAuth('error', { assign: (path) => navigations.push(String(path)) })

  assert.deepEqual(navigations, [EXTERNAL_AUTH_ERROR_PATH])
  assert.equal(EXTERNAL_AUTH_ERROR_PATH, '/auth/error')
})

test('a completed native login lands at the existing knowledge-base home', () => {
  assert.equal(AUTHENTICATED_HOME_PATH, '/platform/knowledge-bases')
})
