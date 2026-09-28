import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const authSource = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('./settings.ts', import.meta.url), 'utf8')

test('auth identity changes reset both persisted and live account-scoped settings', () => {
  assert.match(authSource, /import \{ useSettingsStore \} from ['"]@\/stores\/settings['"]/)
  assert.match(authSource, /previousId !== userData\.id[\s\S]{0,220}clearTenantScopedClientState\(\)/)
  assert.match(authSource, /clearTenantScopedClientState[\s\S]{0,900}useSettingsStore\(\)\.resetForIdentityBoundary\(isLiteMode\.value\)/)
  assert.match(authSource, /const logout = \(\) => \{[\s\S]{0,900}clearTenantScopedClientState\(\)/)
})

test('settings store avoids a static auth cycle and owns the live reset action', () => {
  assert.doesNotMatch(settingsSource, /import \{ useAuthStore \} from ['"]@\/stores\/auth['"]/)
  assert.match(settingsSource, /resetForIdentityBoundary\(isLiteMode = false\)[\s\S]{0,300}resetSettingsForIdentityBoundary\(defaultSettings\)/)
  assert.match(settingsSource, /resetForIdentityBoundary\(isLiteMode = false\)[\s\S]{0,700}localStorage\.setItem\("WeKnora_settings"/)
})
