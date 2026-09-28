import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

function persistOIDCLoginResponse() {
  const start = appSource.indexOf('const persistOIDCLoginResponse = async (response: any) => {')
  const end = appSource.indexOf('const handleGlobalOIDCCallback = async () => {', start)

  assert.notEqual(start, -1, 'OIDC response persistence must exist')
  assert.notEqual(end, -1, 'OIDC response persistence must remain bounded')
  return appSource.slice(start, end)
}

function boundedSource(startMarker, endMarker, label) {
  const start = appSource.indexOf(startMarker)
  const end = appSource.indexOf(endMarker, start)

  assert.notEqual(start, -1, `${label} must exist`)
  assert.notEqual(end, -1, `${label} must remain bounded`)
  return appSource.slice(start, end)
}

test('a complete OIDC callback hydrates immediately and reconciles in the background', () => {
  const persistence = persistOIDCLoginResponse()
  const branchStart = persistence.indexOf('if (hasCompleteOIDCCallbackSnapshot) {')
  const branchEnd = persistence.indexOf('} else {', branchStart)

  assert.notEqual(branchStart, -1, 'complete callback snapshots need an explicit fast path')
  assert.notEqual(branchEnd, -1, 'incomplete callback snapshots need a blocking fallback')

  const completeBranch = persistence.slice(branchStart, branchEnd)
  assert.match(completeBranch, /authStore\.setCanCreateTenant\(false\)/)
  assert.match(completeBranch, /applyOIDCUserContext\(response, false\)/)
  assert.match(completeBranch, /const reconciliationGuard = captureOIDCReconciliationGuard\(\)/)
  assert.match(completeBranch, /void syncOIDCUserContext\(reconciliationGuard\)\.catch/)
  assert.doesNotMatch(completeBranch, /await syncOIDCUserContext\(\)/)
})

test('an incomplete OIDC callback still blocks on the authoritative user context', () => {
  const persistence = persistOIDCLoginResponse()
  const fallbackStart = persistence.indexOf('} else {')
  const fallbackEnd = persistence.indexOf('\n  }', fallbackStart + 1)

  assert.notEqual(fallbackStart, -1, 'incomplete callback snapshots need a fallback branch')
  assert.notEqual(fallbackEnd, -1, 'fallback branch must remain bounded')
  assert.match(persistence.slice(fallbackStart, fallbackEnd), /await syncOIDCUserContext\(\)/)
})

test('callback hydration never accepts capabilities from the URL snapshot', () => {
  const applier = boundedSource(
    'const applyOIDCUserContext =',
    'const captureOIDCReconciliationGuard =',
    'OIDC context applier',
  )

  assert.match(applier, /applyCapabilities && typeof capabilities\?\.can_create_tenant === "boolean"/)
})

test('background reconciliation cannot overwrite a changed session or tenant selection', () => {
  const reconciliation = boundedSource(
    'const isCurrentOIDCReconciliationGuard =',
    'const persistOIDCLoginResponse = async',
    'OIDC background reconciliation',
  )

  assert.match(reconciliation, /isCurrentOIDCReconciliationGuard\(guard\)/)
  assert.match(reconciliation, /authStore\.token === guard\.token/)
  assert.match(reconciliation, /authStore\.selectedTenantId === guard\.selectedTenantId/)
  assert.match(reconciliation, /if \(guard && !isCurrentOIDCReconciliationGuard\(guard\)\) return/)
})
