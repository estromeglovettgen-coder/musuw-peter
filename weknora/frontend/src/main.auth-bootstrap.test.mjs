import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

import { hasPendingOIDCCallback, isDefinitiveNativeSessionFailure } from './utils/nativeAuthHandoff.ts'

// Exercise the real startup and HTTP failure handling together: App.vue cannot
// consume a new OIDC callback until startup mounts it. Framework mounting and
// HTTP responses are the external boundaries; no live authentication is used.
const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
const startupStart = mainSource.indexOf('async function bootstrap() {')
const startupEnd = mainSource.indexOf('\nbootstrap()', startupStart)
assert.ok(startupStart >= 0 && startupEnd > startupStart)
const startup = mainSource.slice(startupStart, startupEnd)
const createBootstrap = new Function(
  'createApp', 'App', 'TDesign', 'createPinia', 'useAuthStore', 'localStorage',
  'router', 'i18n', 'installAutofillGuard', 'window', 'hasPendingOIDCCallback',
  `${startup}; return bootstrap;`,
)

const requestSource = readFileSync(new URL('./utils/request.ts', import.meta.url), 'utf8')
const responseStart = requestSource.indexOf('instance.interceptors.response.use(')
const responseEnd = requestSource.indexOf('\n);', responseStart) + '\n);'.length
assert.ok(responseStart >= 0 && responseEnd > responseStart)
const interceptor = stripTypeScriptTypes(requestSource.slice(responseStart, responseEnd))
  // Replace only the dynamically imported HTTP endpoint with its test fixture.
  .replace("await import('../api/auth/index')", '({ refreshToken: refreshFixture })')

async function startPage({ hash = '', status = 200, refreshStatus } = {}) {
  const events = []
  const values = new Map([['weknora_token', 'old-test-token']])
  if (refreshStatus) values.set('weknora_refresh_token', 'old-test-refresh-token')
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  const window = { location: { pathname: '/', hash } }
  let rejectResponse
  const instance = { interceptors: { response: { use(_, reject) { rejectResponse = reject } } } }
  new Function(
    'instance', 'localStorage', 'window', 't', 'isPublicAuthRequest', 'isEmbedPage',
    'isRefreshing', 'failedQueue', 'redirectToExternalAuthStart', 'i18n', 'MAX_FILE_SIZE_MB',
    'localizeConsumerPlanError', 'isDefinitiveNativeSessionFailure', 'processQueue', 'refreshFixture',
    interceptor,
  )(
    instance, storage, window, key => key, () => false, () => false, false, [],
    () => events.push('redirect:/auth/start'), { global: { t: key => key } }, 10,
    value => value, isDefinitiveNativeSessionFailure, () => {},
    async () => { events.push('refresh-old-token'); throw { status: refreshStatus } },
  )
  const authStore = {
    async refreshFromAuthMe() {
      events.push('validate-old-token')
      if (status === 401) {
        try {
          await rejectResponse({
            response: { status, data: {} },
            config: { url: '/api/v1/auth/me', headers: {} },
          })
        } catch { /* the real store also reports failed reconciliation as false */ }
      }
      return status === 200
    },
  }
  const app = { config: {}, use() {}, mount() { events.push('mount-app') } }
  const bootstrap = createBootstrap(
    () => app, {}, {}, () => ({}), () => authStore, storage,
    { async isReady() { events.push('router-ready') } }, {}, () => {}, window,
    hasPendingOIDCCallback,
  )
  await bootstrap()
  return { events, token: storage.getItem('weknora_token') }
}

for (const refreshStatus of [undefined, 401]) {
  test(`a successful callback mounts before stale credentials can redirect it (refresh ${refreshStatus ?? 'absent'})`, async () => {
    const { events } = await startPage({ hash: '#oidc_result=new-test-session', status: 401, refreshStatus })
    assert.deepEqual(events, ['router-ready', 'mount-app'])
  })
}

test('a successful callback does not wait for even a valid old-session check', async () => {
  const { events } = await startPage({ hash: '#oidc_result=new-test-session' })
  assert.deepEqual(events, ['router-ready', 'mount-app'])
})

test('an error callback reaches its existing router handler without stale-session work', async () => {
  const { events } = await startPage({ hash: '#oidc_error=access_denied' })
  assert.equal(events.includes('validate-old-token'), false)
})

test('an ordinary startup still validates the existing session before mounting', async () => {
  const { events } = await startPage({ hash: '#plain-fragment' })
  assert.deepEqual(events, ['validate-old-token', 'router-ready', 'mount-app'])
})

test('ordinary startup preserves the session after a temporary refresh failure', async () => {
  const { events, token } = await startPage({ status: 401, refreshStatus: 503 })
  assert.deepEqual(events, ['validate-old-token', 'refresh-old-token', 'router-ready', 'mount-app'])
  assert.equal(token, 'old-test-token')
})
