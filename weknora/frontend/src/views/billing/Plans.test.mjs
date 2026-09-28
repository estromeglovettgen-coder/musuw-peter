import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const plans = readFileSync(new URL('./Plans.vue', import.meta.url), 'utf8')

test('localized Paddle preview prices are rendered without reformatting', () => {
  const start = plans.indexOf('const planPrice =')
  const end = plans.indexOf('\nconst planFeatures =', start)

  assert.notEqual(start, -1, 'planPrice must exist')
  assert.notEqual(end, -1, 'planPrice must be bounded')

  const planPrice = plans.slice(start, end)
  assert.match(planPrice, /return localizedPrices\.value\[priceId\]/)
  assert.doesNotMatch(planPrice, /\.replace\(|Intl\.NumberFormat|parseFloat|parseInt|Number\s*\(/)
})

test('Paddle owns visitor localization and preview uses the checkout catalog IDs', () => {
  const priceLoad = plans.slice(plans.indexOf('const loadPrices = async () =>'))
  assert.match(priceLoad, /config\.catalog\?\./)
  assert.match(priceLoad, /priceIds:\s*options\.map\(\(option\) => option\.price_id\)/)
  assert.doesNotMatch(priceLoad, /address\s*:/)
  assert.doesNotMatch(priceLoad, /country\s*:/)
  assert.doesNotMatch(priceLoad, /currency(?:Code)?\s*:/)

  const checkoutCatalog = readFileSync(new URL('./Checkout.vue', import.meta.url), 'utf8')
  assert.match(checkoutCatalog, /config\.catalog\?\.\[plan\]\?\.\[period\.value\]/)
  assert.match(checkoutCatalog, /price_id/)
})

test('billing actions are visible only to workspace owners and admins', () => {
  assert.match(plans, /import \{ useAuthStore \} from ['"]@\/stores\/auth['"]\s*;?/)
  assert.match(plans, /const authStore = useAuthStore\(\)/)
  assert.match(plans, /const canManageBilling = computed\(\(\) => authStore\.hasRole\('admin'\)\)/)

  const mutationGate = plans.slice(plans.indexOf('const canManageBilling'))
  assert.match(mutationGate, /subscriptionUpgradeAvailable = computed\(\(\) =>\s*canManageBilling\.value/)
  assert.match(mutationGate, /const hasCheckout = \(plan: PaidConsumerPlan\) => \{[\s\S]*canManageBilling\.value/)
  assert.match(mutationGate, /const choosePlan = \(plan: ConsumerPlan\) => \{\s*if \(!canManageBilling\.value/)
  assert.match(mutationGate, /const handlePortal = async \(\) => \{\s*if \(!canManageBilling\.value/)

  assert.match(plans, /v-if="!canManageBilling"[^>]*>\{\{ \$t\('entitlement\.billingAdminOnly'\) \}\}/)
  assert.match(plans, /v-if="canManageBilling && canManageSubscription"/)
})

test('expired past_due subscriptions keep portal recovery visible and block duplicate checkout', () => {
  assert.match(plans, /can_manage_billing\s*===\s*true/)
  assert.match(plans, /if \(canManageSubscription\.value\) return 'unavailable'/)
  assert.match(plans, /const canManageSubscription = computed\(\(\) => billing\.value\?\.can_manage_billing/)
  assert.match(plans, /const billingPending = computed\(\(\) => entitlement\.value\?\.openrouter_credits_status === 'pending' \|\|\s*\(entitlement\.value\?\.plan === 'free' && canManageSubscription\.value\)/)
})
