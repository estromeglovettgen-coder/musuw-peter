import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const landingUrl = new URL('./RetainLanding.vue', import.meta.url)
const router = readFileSync(new URL('../../router/index.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8')

function routeSource(path) {
  const start = router.indexOf(`path: "${path}"`)
  const end = router.indexOf('\n    },', start)
  assert.notEqual(start, -1, `${path} route must exist`)
  assert.notEqual(end, -1, `${path} route must be bounded`)
  return router.slice(start, end)
}

test('the Paddle Retain landing page is anonymous, stable, and non-checkout', () => {
  assert.equal(existsSync(landingUrl), true, 'the public /retain page must exist')
  const page = readFileSync(landingUrl, 'utf8')
  const retainRoute = routeSource('/retain')

  assert.match(retainRoute, /RetainLanding\.vue/)
  assert.match(retainRoute, /requiresAuth:\s*false/)
  assert.match(retainRoute, /requiresInit:\s*false/)
  assert.doesNotMatch(retainRoute, /redirect:/)
  assert.doesNotMatch(page, /useRoute|URLSearchParams|router\.(?:push|replace)|Checkout|price|payment/i)
  assert.match(page, /https:\/\/musuw\.com\//)
  assert.match(page, /href="\/auth\/start"/)
  assert.doesNotMatch(page, /https:\/\/app\.musuw\.com\/auth\/start/)
})

test('Retain reuses the application Paddle.js singleton', () => {
  assert.match(app, /const syncPaddleRetain = async \(\) =>/)
  assert.match(app, /getPaddlePublicConfig\(\)/)
  assert.match(app, /initializePaddlePaymentLink\(/)
  assert.match(app, /watch\([\s\S]*syncPaddleRetain\(\)/)

  const page = readFileSync(landingUrl, 'utf8')
  assert.doesNotMatch(page, /initializePaddle|Paddle\.Initialize|<script[^>]+src=/)
})
