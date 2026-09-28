import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AttachmentUpload.vue', import.meta.url), 'utf8')

test('Lite attachment discovery excludes the deferred XMind parser while Standard retains it', () => {
  assert.match(source, /const authStore = useAuthStore\(\)/)
  assert.match(
    source,
    /!authStore\.isLiteMode \|\| normalizedType !== 'xmind'/,
  )
  assert.match(source, /authStore\.isLiteMode && ext === '\.xmind'/)
  assert.match(source, /\.map\(type => `\.\$\{type\.replace/)
})

test('a persisted chat attachment silently revalidates the shared quota snapshot', () => {
  assert.match(source, /import \{ useCurrentEntitlementStore \} from '@\/stores\/entitlement'/)
  assert.match(source, /const entitlementStore = useCurrentEntitlementStore\(\)/)
  assert.match(
    source,
    /attachment\.documentId = response\.data\.id[\s\S]*?if \(disposed[\s\S]*?return;[\s\S]*?void entitlementStore\.refresh\(\)/,
  )
})
