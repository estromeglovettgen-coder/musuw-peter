import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('./entitlement.ts', import.meta.url), 'utf8')

test('activity revalidation stays scoped, visible-only, and low frequency', () => {
  assert.match(source, /const ENTITLEMENT_REVALIDATION_COOLDOWN_MS\s*=\s*30_000/)
  assert.match(
    source,
    /const handleActivityRevalidation = \(\) => \{[\s\S]*if \(!scopeKey\.value\) return[\s\S]*document\.visibilityState !== 'visible'[\s\S]*const now = Date\.now\(\)[\s\S]*if \(now - lastActivityRevalidationAt < ENTITLEMENT_REVALIDATION_COOLDOWN_MS\) return[\s\S]*lastActivityRevalidationAt = now[\s\S]*void ensureFresh\(\)/,
  )
  assert.match(source, /const scopeKey = computed\(\(\) => \{[\s\S]*currentUserId[\s\S]*effectiveTenantId/)
})

test('activity listeners are installed once and removed with the store scope', () => {
  assert.match(source, /window\.addEventListener\('focus', handleActivityRevalidation\)/)
  assert.match(source, /document\.addEventListener\('visibilitychange', handleActivityRevalidation\)/)
  assert.match(
    source,
    /onScopeDispose\(\(\) => \{[\s\S]*window\.removeEventListener\('focus', handleActivityRevalidation\)[\s\S]*document\.removeEventListener\('visibilitychange', handleActivityRevalidation\)/,
  )
})

test('activity revalidation reuses the existing request dedupe and keeps snapshots intact', () => {
  assert.match(source, /if \(inFlight && inFlightScope === scope\) return inFlight/)
  const handlerStart = source.indexOf('const handleActivityRevalidation =')
  const handlerEnd = source.indexOf('\n  if \(typeof window', handlerStart)
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart)
  const handler = source.slice(handlerStart, handlerEnd)
  assert.match(handler, /void ensureFresh\(\)/)
  assert.doesNotMatch(handler, /storedEntitlement|storedBilling|lastUpdatedAt/)
  assert.match(source, /catch \{[\s\S]*lastActivityRevalidationAt = 0[\s\S]*if \(!storedEntitlement\.value\)/)
})
