import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const routerSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const entryHTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const entryRestoreScript = [...entryHTML.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('weknora_lite_last_path'))

function runEntryRestore(path, { search = '', hash = '', lite = true } = {}) {
  assert.ok(entryRestoreScript, 'execute the actual HTML entry restore script')
  let url = path + search + hash
  runInNewContext(entryRestoreScript, {
    localStorage: { getItem: key => key === 'weknora_lite_mode' && lite ? 'true' : null },
    sessionStorage: { getItem: key => key === 'weknora_lite_last_path' ? '/platform/creatChat' : null },
    window: {
      location: { pathname: path, search, hash },
      history: { state: null, replaceState: (_state, _title, target) => { url = target } },
    },
  })
  return url
}

function oidcErrorGuard() {
  const start = routerSource.indexOf('if (hasOIDCErrorCallback(window.location.hash || \'\'))')
  const end = routerSource.indexOf("if (hasPendingOIDCCallback(window.location.hash || ''))", start)

  assert.notEqual(start, -1, 'OIDC error guard must exist')
  assert.notEqual(end, -1, 'OIDC error guard must run before the generic callback bypass')
  return routerSource.slice(start, end)
}

test('an OIDC error stops routing before a protected route can start auth again', () => {
  const guard = oidcErrorGuard()

  assert.match(guard, /handoffToExternalAuth\('error'\)/)
  assert.match(guard, /next\(false\)/)
})

function nativeAuthEntryGuard() {
  const start = routerSource.indexOf("if (to.path === '/login' || to.path === '/register')")
  const end = routerSource.indexOf('// Tenantless onboarding', start)

  assert.notEqual(start, -1, 'native /login and /register guard must exist')
  assert.notEqual(end, -1, 'native auth guard must remain bounded before tenant onboarding')
  return routerSource.slice(start, end)
}

test('a cold authenticated /login load restores the native session before auth handoff', () => {
  const guard = nativeAuthEntryGuard()
  const hydrate = guard.indexOf('await hydrateSessionFromToken(authStore)')
  const handoff = guard.indexOf("handoffToExternalAuth('start')")

  assert.notEqual(hydrate, -1, 'cold native session must be hydrated in the login branch')
  assert.notEqual(handoff, -1, 'signed-out entry must still hand off to the auth shell')
  assert.ok(hydrate < handoff, 'session hydration must happen before signed-out handoff')
  assert.match(
    guard,
    /if \(!restored\)\s*\{\s*handoffToExternalAuth\('start'\)\s*next\(false\)/,
    'signed-out /login must enter the Musuw auth shell without a native-login bypass',
  )
  assert.match(
    guard,
    /next\(authStore\.hasValidTenant \? AUTHENTICATED_HOME_PATH : '\/onboarding\/workspace'\)/,
  )
})

test('only generic Lite entry routes restore the last page', () => {
  assert.match(
    routerSource,
    /localStorage\.getItem\('weknora_lite_mode'\) === 'true'[\s\S]*sessionStorage\.getItem\(LITE_LAST_PATH_KEY\)/,
  )
  assert.match(routerSource, /path: "\/platform",[\s\S]*redirect: authenticatedEntryPath/)
  assert.doesNotMatch(routerSource, /isLiteSpaDefaultEntry/)
})

test('a cold knowledge-base list URL is not overwritten by the previous chat before Vue starts', () => {
  assert.equal(runEntryRestore('/platform/knowledge-bases'), '/platform/knowledge-bases')
  const wikiPath = '/platform/marketplace/product/knowledge-bases/kb'
  assert.equal(runEntryRestore(wikiPath), wikiPath)
})

for (const path of ['/', '/platform']) {
  test(`the generic ${path} entry retains Lite restore without overriding explicit auth or checkout intent`, () => {
    assert.equal(runEntryRestore(path), '/platform/creatChat')
    assert.equal(runEntryRestore(path, { lite: false }), path)
    const search = '?plan=max&period=yearly'
    assert.equal(runEntryRestore(path, { search }), path + search)
    for (const hash of ['#oidc_result=callback', '#oidc_error=denied']) {
      assert.equal(runEntryRestore(path, { hash }), path + hash)
    }
  })
}

test('generic product entry never restores a prior billing surface', () => {
  const policyStart = routerSource.indexOf('function isSafeLiteRestoreTarget(path: string)')
  const policyEnd = routerSource.indexOf('\n}\n', policyStart)

  assert.notEqual(policyStart, -1, 'Lite restore policy must exist')
  assert.notEqual(policyEnd, -1, 'Lite restore policy must have a bounded body')

  const policy = routerSource.slice(policyStart, policyEnd + 2)
  assert.match(
    policy,
    /return isAllowedLitePath\(pathname\) && pathname !== '\/plans' && pathname !== '\/checkout'/,
  )
})

test('an explicit storefront checkout intent still wins before normal app entry', () => {
  const entryStart = routerSource.indexOf('function authenticatedEntryPath(')
  const entryEnd = routerSource.indexOf('\n}\n', entryStart)

  assert.notEqual(entryStart, -1, 'authenticated entry policy must exist')
  assert.notEqual(entryEnd, -1, 'authenticated entry policy must have a bounded body')

  const entry = routerSource.slice(entryStart, entryEnd + 2)
  const checkoutIntent = entry.indexOf("return { path: '/plans', query: { plan, period } }")
  const normalRestore = entry.indexOf('sessionStorage.getItem(LITE_LAST_PATH_KEY)')
  assert.notEqual(checkoutIntent, -1, 'supported checkout intent must enter plans')
  assert.notEqual(normalRestore, -1, 'normal app entry must retain safe workspace restore')
  assert.ok(checkoutIntent < normalRestore, 'checkout intent must be handled before normal restore')
})

test('Lite settings routes keep exposed channel sections and canonicalize hidden integrations', () => {
  const guardStart = routerSource.indexOf("if (to.path === '/platform/settings')", routerSource.indexOf('if (isLiteEdition(authStore))'))
  const guardEnd = routerSource.indexOf('\n    }', guardStart)

  assert.notEqual(guardStart, -1, 'Lite settings route guard must exist')
  assert.notEqual(guardEnd, -1, 'Lite settings route guard must remain bounded')

  const guard = routerSource.slice(guardStart, guardEnd + 6)
  assert.match(guard, /normalizeExposedIntegrationSettingsSection/)
  assert.match(guard, /LITE_SETTINGS_ROUTE_SECTIONS/)
  assert.match(guard, /buildSettingsRouteQuery/)
  assert.match(
    routerSource,
    /LITE_SETTINGS_ROUTE_SECTIONS[\s\S]*'integration-im'[\s\S]*'integration-embed'/,
  )
})
