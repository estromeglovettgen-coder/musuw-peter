import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const paymentLinkUrl = new URL('./PaymentLink.vue', import.meta.url)
const router = readFileSync(new URL('../../router/index.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../../api/entitlement.ts', import.meta.url), 'utf8')
const request = readFileSync(new URL('../../utils/request.ts', import.meta.url), 'utf8')
const paddle = readFileSync(new URL('../../utils/paddleCheckout.ts', import.meta.url), 'utf8')

function routeSource(path) {
  const start = router.indexOf(`path: "${path}"`)
  const end = router.indexOf('\n    },', start)
  assert.notEqual(start, -1, `${path} route must exist`)
  assert.notEqual(end, -1, `${path} route must be bounded`)
  return router.slice(start, end)
}

test('the Paddle default payment-link page is public and preserves the provider URL', () => {
  assert.equal(existsSync(paymentLinkUrl), true, 'the public /pay page must exist')
  const page = readFileSync(paymentLinkUrl, 'utf8')
  const payRoute = routeSource('/pay')

  assert.match(payRoute, /PaymentLink\.vue/)
  assert.match(payRoute, /requiresAuth:\s*false/)
  assert.match(payRoute, /requiresInit:\s*false/)
  assert.match(page, /getPaddlePublicConfig\(\)/)
  assert.match(page, /initializePaddlePaymentLink\(/)
  assert.match(page, /config\.configured[\s\S]*config\.environment[\s\S]*config\.client_token/)
  assert.match(page, /v-if="loading"/)
  assert.match(page, /v-else-if="errorMessage"/)
  assert.doesNotMatch(page, /useRoute|URLSearchParams|_ptxn|Checkout\.open|router\.(?:push|replace)/)
})

test('an anonymous /pay navigation exits before session hydration or auth handoff', () => {
  const guard = router.slice(router.indexOf('router.beforeEach'))
  const anonymousExit = guard.indexOf('if (to.meta.requiresAuth === false || to.meta.requiresInit === false)')
  const authenticatedGate = guard.indexOf('if (to.meta.requiresAuth !== false)', anonymousExit)
  assert.notEqual(anonymousExit, -1)
  assert.notEqual(authenticatedGate, -1)
  assert.ok(anonymousExit < authenticatedGate)
  assert.match(guard.slice(anonymousExit, authenticatedGate), /next\(\)\s*return/)
})

test('the public payment-link runtime uses only the anonymous client config and official SDK initialization', () => {
  assert.match(api, /getPaddlePublicConfig[\s\S]*\/api\/v1\/billing\/paddle\/public-config/)
  assert.match(request, /PADDLE_PUBLIC_CONFIG_PATH\s*=\s*['"]\/api\/v1\/billing\/paddle\/public-config['"];/)
  assert.match(request, /url\.split\(['"]\?['"]\)\[0\]\s*===\s*PADDLE_PUBLIC_CONFIG_PATH/)
  assert.doesNotMatch(request, /PUBLIC_AUTH_PATHS\s*=\s*\[[^\]]*paddle/i)

  const start = paddle.indexOf('export async function initializePaddlePaymentLink')
  const end = paddle.indexOf('\nexport ', start + 1)
  assert.notEqual(start, -1, 'payment-link initializer must be exported')
  const initializer = paddle.slice(start, end === -1 ? undefined : end)
  assert.match(initializer, /await initialize\(input\)/)
  assert.doesNotMatch(initializer, /Checkout\.open|_ptxn|transactionId|items:/)
})

test('the public payment-link page offers home, support, and legal exits', () => {
  assert.equal(existsSync(paymentLinkUrl), true, 'the public /pay page must exist')
  const page = readFileSync(paymentLinkUrl, 'utf8')
  for (const href of [
    'https://musuw.com/',
    'https://musuw.com/contact',
    'https://musuw.com/terms',
    'https://musuw.com/privacy',
    'https://musuw.com/refund-policy',
  ]) {
    assert.match(page, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
