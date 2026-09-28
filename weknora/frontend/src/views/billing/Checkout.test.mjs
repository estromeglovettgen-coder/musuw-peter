import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const checkout = readFileSync(new URL('./Checkout.vue', import.meta.url), 'utf8')

test('direct checkout navigation is gated to workspace owners and admins', () => {
  assert.match(checkout, /const canManageBilling = computed\(\(\) => authStore\.hasRole\('admin'\)\)/)

  const start = checkout.indexOf('const initializeCheckout = async () =>')
  const end = checkout.indexOf('\nconst confirmUpgrade', start)
  assert.notEqual(start, -1, 'checkout initialization must exist')
  assert.notEqual(end, -1, 'checkout initialization must be bounded')
  const initialize = checkout.slice(start, end)

  assert.match(initialize, /if \(!canManageBilling\.value\) \{[\s\S]*billingAdminOnly[\s\S]*return\n  \}/)
  assert.ok(
    initialize.indexOf("billingAdminOnly") < initialize.indexOf('entitlementStore.refresh()'),
    'a viewer must be rejected before checkout/upgrade provider work starts',
  )
  assert.doesNotMatch(checkout, /getCurrentEntitlement/)
  assert.match(checkout, /createPaddleCheckoutIntent\(/)
  assert.match(checkout, /upgradePaddleSubscription\(/)
})

test('a declined payment keeps the hosted checkout mounted for an immediate retry', () => {
  assert.match(checkout, /const checkoutAttemptError = ref\(''\)/)
  assert.match(checkout, /CHECKOUT_PAYMENT_FAILED[\s\S]*checkoutAttemptError\.value/)
  assert.match(checkout, /CHECKOUT_PAYMENT_ERROR[\s\S]*checkoutAttemptError\.value/)
  assert.match(checkout, /checkout-page__attempt-error/)

  const templateStart = checkout.indexOf('<template>')
  const scriptStart = checkout.indexOf('<script setup', templateStart)
  const template = checkout.slice(templateStart, scriptStart)
  assert.doesNotMatch(template, /v-else-if="checkoutAttemptError"/)
  assert.match(template, /checkout-page__attempt-error[\s\S]*paddle-inline-target/)
})
