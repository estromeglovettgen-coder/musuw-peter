import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const usageSettings = await readFile(new URL('./UsageBillingSettings.vue', import.meta.url), 'utf8')
const settingsShell = await readFile(new URL('./Settings.vue', import.meta.url), 'utf8')
const userMenu = await readFile(new URL('../../components/UserMenu.vue', import.meta.url), 'utf8')
const entitlementApi = await readFile(new URL('../../api/entitlement.ts', import.meta.url), 'utf8')
const entitlementStore = await readFile(new URL('../../stores/entitlement.ts', import.meta.url), 'utf8')
const chatView = await readFile(new URL('../chat/index.vue', import.meta.url), 'utf8')
const appShell = await readFile(new URL('../../App.vue', import.meta.url), 'utf8')
const router = await readFile(new URL('../../router/index.ts', import.meta.url), 'utf8')
const plansPage = await readFile(new URL('../billing/Plans.vue', import.meta.url), 'utf8')
const checkoutPage = await readFile(new URL('../billing/Checkout.vue', import.meta.url), 'utf8')
const referenceIcons = await readFile(new URL('../../assets/musuw-reference-lucide-precision.css', import.meta.url), 'utf8')

test('entitlement API types the official OpenRouter credit availability state', () => {
  assert.match(entitlementApi, /OpenRouterCreditsStatus\s*=\s*'available'\s*\|\s*'unavailable'\s*\|\s*'unprovisioned'\s*\|\s*'pending'/)
  assert.match(entitlementApi, /openrouter_credits_status:\s*OpenRouterCreditsStatus/)
})

test('usage settings shows only remaining percentages without provider or dollar fields', () => {
  assert.match(usageSettings, /openrouter_credits_status === 'unavailable'/)
  assert.match(usageSettings, /openrouter_credits_status === 'pending'/)
  assert.match(usageSettings, /openrouter_credits_status === 'unprovisioned'\) return 100/)
  assert.match(usageSettings, /clampPercent\(\(remaining \/ total\) \* 100\)/)
  assert.match(usageSettings, /creditsRemainingPercent \}\}%/)
  assert.match(usageSettings, /storageRemainingPercent \}\}%/)
  assert.doesNotMatch(usageSettings, /creditsUsedPercent|storageUsedPercent|entitlement\.usedPercent/)
  assert.doesNotMatch(usageSettings, /formatCredits|monthlyCredits|OpenRouter|\$\d/)
})

test('opening the account menu revalidates quota without hiding a usable snapshot', () => {
  assert.match(
    userMenu,
    /const handleTriggerClick = \(\) => \{[\s\S]*menuVisible\.value = !menuVisible\.value[\s\S]*if \(menuVisible\.value\) void loadEntitlement\(\)/,
  )
  assert.match(userMenu, /clampPercent\(\(remaining \/ total\) \* 100\)/)
  assert.match(entitlementStore, /const requestSequence = \+\+activeRequestSequence/)
  assert.match(entitlementStore, /if \(requestSequence !== activeRequestSequence/)
  assert.match(
    userMenu,
    /<small v-if="entitlementLoading && !entitlement">\{\{ \$t\('common\.loading'\) \}\}<\/small>[\s\S]*<small v-else-if="usageRemainingPercent !== null">/,
    'loading may replace the value only before the first usable snapshot exists',
  )
  assert.match(
    usageSettings,
    /<div v-if="entitlementLoading && !entitlement" class="usage-billing__loading">/,
    'the settings page must keep cached rows mounted during background revalidation',
  )
  assert.match(
    entitlementStore,
    /catch \{[\s\S]*if \(requestSequence !== activeRequestSequence \|\| scope !== scopeKey\.value\) return[\s\S]*if \(!storedEntitlement\.value\) \{[\s\S]*storedBilling\.value = null/,
    'a failed background refresh must not destroy a successful scope-matched snapshot',
  )
})

test('account menu and usage settings consume one freshness-scoped entitlement snapshot', () => {
  assert.match(userMenu, /useCurrentEntitlementStore/)
  assert.match(userMenu, /entitlementStore\.refresh\(\)/)
  assert.match(usageSettings, /useCurrentEntitlementStore/)
  assert.match(usageSettings, /entitlementStore\.ensureFresh\(\)/)
  assert.doesNotMatch(userMenu, /const entitlement = ref<ConsumerEntitlement/)
  assert.doesNotMatch(usageSettings, /const entitlement = ref<ConsumerEntitlement/)
  assert.match(entitlementStore, /CURRENT_ENTITLEMENT_FRESH_MS\s*=\s*2_000/)
  assert.match(entitlementStore, /if \(inFlight && inFlightScope === scope\) return inFlight/)
  assert.match(entitlementStore, /if \(storedScope\.value !== scope\) \{[\s\S]*storedEntitlement\.value = null[\s\S]*storedBilling\.value = null/)
  assert.match(entitlementStore, /if \(requestSequence !== activeRequestSequence \|\| scope !== scopeKey\.value\) return/)
  assert.match(chatView, /useCurrentEntitlementStore/)
  assert.match(
    chatView,
    /const replyState = \(state as any\)\.isReplying[\s\S]*watch\([\s\S]*Boolean\(replyState\?\.value\)[\s\S]*if \(replying\)[\s\S]*entitlementStore\.invalidate\(\)[\s\S]*if \(wasReplying\) void entitlementStore\.ensureFresh\(\)[\s\S]*flush: 'sync'/,
    'the normalized parent must invalidate quota when generation starts and silently revalidate it as soon as the reply settles',
  )
})

test('app shell, pricing and checkout share the entitlement request and payment refresh path', () => {
  for (const source of [appShell, plansPage, checkoutPage]) {
    assert.match(source, /useCurrentEntitlementStore/)
    assert.doesNotMatch(source, /getCurrentEntitlement/)
  }
  assert.match(appShell, /await entitlementStore\.ensureFresh\(\)/)
  assert.match(plansPage, /await entitlementStore\.refresh\(\)/)
  assert.match(checkoutPage, /const refreshAfterPayment = async \(\) =>[\s\S]*await entitlementStore\.refresh\(\)/)
  assert.match(checkoutPage, /entitlementStore\.invalidate\(\)[\s\S]*void entitlementStore\.ensureFresh\(\)/)
})

test('the free-plan upgrade affordance keeps a valid visible icon mask', () => {
  assert.match(userMenu, /visual-user-menu__billing-item[\s\S]*class="\{ 'is-free': billingIsFree \}"/)
  assert.match(referenceIcons, /--mvp-sparkles:[^\n]*1\.594-1\.594z%22%2F%3E/)
  assert.match(referenceIcons, /\.visual-user-menu__billing-item\.is-free::before[\s\S]*mask-image: var\(--mvp-sparkles\)/)
})

test('credit period copy uses the tenant personal-cycle boundary', () => {
  assert.match(entitlementApi, /openrouter_resets_at\?:\s*string/)
  assert.match(usageSettings, /const raw = entitlement\.value\?\.openrouter_resets_at/)
  assert.match(usageSettings, /v-if="formattedResetAt"/)
})

test('plans live on a standalone authenticated route instead of inside Settings', () => {
  assert.match(router, /path: "\/plans"[\s\S]*views\/billing\/Plans\.vue/)
  assert.match(router, /return \{ path: '\/plans', query: \{ plan, period \} \}/)
  assert.match(usageSettings, /router\.push\('\/plans'\)/)
  assert.doesNotMatch(usageSettings, /usage-billing__pricing|openPaddleCheckout|previewPaddleSubscriptionUpgrade/)
  assert.doesNotMatch(settingsShell, /is-usage|hasCheckoutIntent/)
  assert.match(plansPage, /class="plans-page__grid"/)
})

test('Paddle customer portal stays server-authenticated and redirects with a fresh session URL', () => {
  assert.match(entitlementApi, /portal_available:\s*boolean/)
  assert.match(entitlementApi, /post\('\/api\/v1\/billing\/paddle\/portal-session'\)/)
  assert.match(usageSettings, /billing\.value\?\.portal_available\s*===\s*true/)
  assert.match(usageSettings, /window\.location\.assign\(response\.authorization_url\)/)
  const assertPortalInvalidatesBeforeRedirect = (source, label) => {
    const start = source.indexOf('const handlePortal = async () =>')
    const end = source.indexOf('\n}\n', start)
    const handler = source.slice(start, end)
    const sessionUrl = handler.indexOf('response.authorization_url')
    const invalidate = handler.indexOf('entitlementStore.invalidate()')
    const redirect = handler.indexOf('window.location.assign(response.authorization_url)')
    assert.ok(start >= 0 && end > start, `${label} portal handler is present`)
    assert.ok(sessionUrl >= 0 && invalidate > sessionUrl && redirect > invalidate, `${label} invalidates stale quota before returning from Paddle portal`)
  }
  assertPortalInvalidatesBeforeRedirect(usageSettings, 'usage settings')
  assertPortalInvalidatesBeforeRedirect(plansPage, 'plans')
  assert.match(usageSettings, /router\.push\('\/plans'\)/)
  const start = entitlementApi.indexOf('export async function createPaddlePortalSession')
  const end = entitlementApi.indexOf('\nexport async function', start + 1)
  const portalMethod = entitlementApi.slice(start, end)
  assert.doesNotMatch(portalMethod, /customer_id|pw_customer|payload/)
  assert.match(entitlementApi, /pw_customer_id\?:\s*string/)
})
