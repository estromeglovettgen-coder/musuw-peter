import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const checkout = readFileSync(new URL('./Checkout.vue', import.meta.url), 'utf8')
const locales = [
  readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../i18n/locales/ko-KR.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../i18n/locales/ru-RU.ts', import.meta.url), 'utf8'),
]

function refreshAfterPaymentSource() {
  const start = checkout.indexOf('const refreshAfterPayment = async () =>')
  const end = checkout.indexOf('\nconst mountCheckout', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return checkout.slice(start, end)
}

test('exhausted entitlement polling exits syncing and exposes a delayed-sync state', () => {
  const refresh = refreshAfterPaymentSource()
  assert.match(checkout, /const syncDelayed = ref\(false\)/)
  assert.match(refresh, /syncDelayed\.value = false[\s\S]*syncing\.value = true/)
  assert.match(refresh, /for \(const delay of \[700, 1200, 1800, 2500, 3500\]\)/)
  assert.match(refresh, /syncing\.value = false\s*syncDelayed\.value = true\s*\}\s*$/)
})

test('delayed synchronization offers safe return and refresh actions without granting a plan', () => {
  assert.match(checkout, /completed \|\| syncing \|\| syncDelayed/)
  assert.match(checkout, /checkoutSyncDelayedTitle/)
  assert.match(checkout, /checkoutSyncDelayedDescription/)
  assert.match(checkout, /syncDelayed[\s\S]*@click="leaveCheckout"/)
  assert.match(checkout, /syncDelayed[\s\S]*@click="refreshAfterPayment"/)

  for (const source of locales) {
    assert.match(source, /checkoutSyncDelayedTitle:/)
    assert.match(source, /checkoutSyncDelayedDescription:/)
    assert.match(source, /refreshStatus:/)
  }
})
