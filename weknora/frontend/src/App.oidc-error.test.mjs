import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

function oidcCallbackHandler() {
  const start = appSource.indexOf('const handleGlobalOIDCCallback = async () => {')
  const end = appSource.indexOf('let updateCheckTimer', start)

  assert.notEqual(start, -1, 'global OIDC callback handler must exist')
  assert.notEqual(end, -1, 'global OIDC callback handler must remain bounded')
  return appSource.slice(start, end)
}

test('a native OIDC callback error leaves the app for an explicit retry route', () => {
  const handler = oidcCallbackHandler()

  assert.match(handler, /handoffToExternalAuth\(["']error["']\)/)
  assert.doesNotMatch(handler, /clearOIDCCallbackState\("\/login"\)/)
  assert.doesNotMatch(handler, /router\.replace\("\/login"\)/)
})
