import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const paddle = readFileSync(new URL('./paddleCheckout.ts', import.meta.url), 'utf8')
const entitlementApi = readFileSync(new URL('../api/entitlement.ts', import.meta.url), 'utf8')
const plans = readFileSync(new URL('../views/billing/Plans.vue', import.meta.url), 'utf8')
const checkout = readFileSync(new URL('../views/billing/Checkout.vue', import.meta.url), 'utf8')
const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')

test('authenticated Paddle customer identity is tenant-derived and passed to Retain', () => {
  assert.match(entitlementApi, /pw_customer_id\?: string/)
  assert.match(plans, /pwCustomerId:\s*config\.pw_customer_id/)
  assert.match(checkout, /pwCustomerId:\s*config\.pw_customer_id/g)
  assert.match(paddle, /pwCustomer:\s*pwCustomerId\s*\?\s*\{\s*id:\s*pwCustomerId\s*\}\s*:\s*\{\}/)
})

test('the Paddle singleton updates Retain when an SPA session identifies a customer later', () => {
  assert.match(paddle, /paddle\.Update\(\{\s*pwCustomer:/)
  assert.doesNotMatch(paddle, /pwCustomer:\s*\{\s*(?:email|id):\s*input\.(?:email|tenantId)/)
})

test('an initialized Paddle singleton fails closed if the runtime environment changes', () => {
  assert.match(paddle, /activeEnvironment/)
  assert.match(paddle, /activeClientToken/)
  assert.match(paddle, /Paddle\.js configuration changed; reload required/)
})

test('the app initializes official Paddle.js on public and authenticated pages for Retain', () => {
  assert.match(app, /getPaddlePublicConfig/)
  assert.match(app, /useCurrentEntitlementStore/)
  assert.match(app, /await entitlementStore\.ensureFresh\(\)/)
  assert.doesNotMatch(app, /getCurrentEntitlement/)
  assert.match(app, /initializePaddlePaymentLink/)
  assert.match(app, /authStore\.effectiveTenantId/)
  assert.match(app, /pwCustomerId = entitlementStore\.billing\?\.pw_customer_id/)
  assert.match(app, /pwCustomerId,/)
})

test('self-service checkout opens exactly one server-created official Paddle transaction', () => {
  assert.match(entitlementApi, /createPaddleCheckoutIntent/)
  assert.match(entitlementApi, /\/api\/v1\/billing\/paddle\/checkout-intent/)
  assert.match(entitlementApi, /billing_period: input\.billingPeriod/)
  assert.match(entitlementApi, /operation_key: input\.operationKey/)
  assert.match(entitlementApi, /subscription-upgrade[\s\S]*operation_key: operationKey/)
  assert.match(checkout, /createPaddleCheckoutIntent\(/)
  assert.match(checkout, /checkoutOperationKey/)
  assert.match(checkout, /upgradeOperationKey/)
  assert.match(checkout, /upgradePaddleSubscription\(plan, getUpgradeOperationKey\(\)\)/)
  assert.match(checkout, /transactionId: intent\.transaction_id/)
  assert.match(checkout, /config\.catalog\?\./)
  assert.doesNotMatch(checkout, /checkoutBinding:|tenantId:|config\.tenant_id/)
  assert.match(paddle, /transactionId:\s*input\.transactionId/)
  assert.doesNotMatch(paddle, /Checkout\.open\(\{[\s\S]*items:/)
  assert.doesNotMatch(paddle, /Checkout\.open\(\{[\s\S]*customData:/)
})

test('localized price preview uses Paddle final totals, not pre-tax subtotals', () => {
  assert.match(paddle, /formattedSubtotal:\s*item\.formattedUnitTotals\.subtotal/)
  assert.match(paddle, /formattedTotal:\s*item\.formattedTotals\.total/)
  assert.doesNotMatch(paddle, /formattedUnitSubtotal/)
  assert.match(plans, /preview\.formattedTotal/)
  assert.match(checkout, /previewSubtotal\.value = preview\?\.formattedSubtotal/)
  assert.match(checkout, /preview\?\.formattedTotal/)
})

test('PricePreview leaves country and currency selection to Paddle', () => {
  const start = paddle.indexOf('export async function previewPaddlePrices')
  const end = paddle.indexOf('\nexport async function openPaddleInlineCheckout', start)
  assert.notEqual(start, -1, 'preview helper must exist')
  assert.notEqual(end, -1, 'preview helper must be bounded')

  const preview = paddle.slice(start, end)
  assert.match(preview, /paddle\.PricePreview\(\{\s*items:/)
  const request = preview.slice(preview.indexOf('paddle.PricePreview'), preview.indexOf('})\n  return'))
  assert.doesNotMatch(request, /address\s*:/)
  assert.doesNotMatch(request, /country\s*:/)
  assert.doesNotMatch(request, /currency(?:Code)?\s*:/)
  assert.match(preview, /formattedTotals\.total/)
})
