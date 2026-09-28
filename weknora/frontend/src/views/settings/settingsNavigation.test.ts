import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { filterSettingsNavigation } from './settingsNavigation'

const settingsSource = readFileSync(new URL('./Settings.vue', import.meta.url), 'utf8')
const settingsShellSource = readFileSync(new URL('./components/VisualSettingsShell.vue', import.meta.url), 'utf8')

const authorizedItems = [
  { key: 'general', label: '常规设置' },
  { key: 'usage', label: '使用情况与计费' },
  { key: 'userprofile', label: '用户信息' },
  { key: 'models', label: '模型选择' },
  { key: 'mymemory', label: '我的记忆' },
  { key: 'memory', label: '长期记忆' },
]

test('settings search filters only the already-authorized navigation surface', () => {
  assert.deepEqual(filterSettingsNavigation(authorizedItems, '  计费  '), [authorizedItems[1]])
  assert.deepEqual(filterSettingsNavigation(authorizedItems, 'USER'), [authorizedItems[2]])
  assert.deepEqual(filterSettingsNavigation(authorizedItems, ''), authorizedItems)
})

test('settings search never synthesizes a hidden section', () => {
  assert.deepEqual(filterSettingsNavigation(authorizedItems, 'system-global'), [])
})

test('Lite settings expose only member channels while retaining manager workspace settings', () => {
  assert.match(
    settingsSource,
    /if \(!canManageSettingsNavigation\.value\) return integrationSectionKey\('im'\)/,
  )
  assert.match(
    settingsSource,
    /if \(!canManageSettingsNavigation\.value\) \{[\s\S]*return integrationItems\.filter/,
  )
  assert.match(settingsSource, /INTEGRATION_PREVIEW_ITEMS[\s\S]*isExposedIntegrationTab/)
  assert.match(settingsSource, /if \(authStore\.isLiteMode\) \{[\s\S]*if \(key === 'mcp'\) return authStore\.canAccessAllTenants \|\| authStore\.hasRole\('admin'\)[\s\S]*key === 'mymemory'[\s\S]*key === 'memory'/)
  assert.match(settingsSource, /\{ key: 'models', icon: 'cpu', label: t\('settings\.modelManagement'\) \}/)
  assert.match(settingsSource, /\{ key: 'mymemory', icon: 'bookmark', label: t\('memorySettings\.title'\) \}/)
  assert.match(settingsSource, /\{ key: 'memory', icon: 'bulletpoint', label: t\('memoryWorkspaceSettings\.title'\) \}/)
  assert.match(settingsSource, /const SYSTEM_ADMIN_SECTIONS = SYSTEM_ADMIN_SETTINGS_SECTIONS/)
})

test('Lite and Standard both expose complete memory settings through one Advanced disclosure', () => {
  const memory = readFileSync(new URL('./MemoryWorkspaceSettings.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(memory, /authStore\.isLiteMode/)
  const advancedIndex = memory.indexOf('memoryWorkspaceSettings.advancedLabel')
  assert.ok(advancedIndex >= 0, 'memory source lost the Advanced disclosure')
  for (const token of ['extractModelLabel', 'embeddingModelLabel', 'extractDelayLabel', 'extractMinIntervalLabel']) {
    const index = memory.indexOf(token)
    assert.ok(index >= 0, `memory source lost ${token}`)
    assert.ok(index > advancedIndex, `${token} must remain reachable under Advanced`)
  }
  assert.match(memory, /v-model="config\.enabled"/)
  assert.match(memory, /v-model="config\.write_mode"/)
  assert.match(memory, /v-model="config\.max_items"/)
})

test('Lite profile does not expose password rotation controls', () => {
  const profile = readFileSync(new URL('./UserProfile.vue', import.meta.url), 'utf8')
  const row = profile.slice(profile.indexOf('userProfile.changePassword.label') - 350, profile.indexOf('userProfile.changePassword.label') + 250)
  assert.match(row, /v-if="!authStore\.isLiteMode"/)
})

test('settings traps focus only when it is a modal and restores the launcher', () => {
  for (const token of [
    'aria-modal="true"',
    'ref="dialogRef"',
    '@keydown.tab="handleDialogTab"',
    'lastFocusedElement',
    'dialogRef.value?.focus()',
    'lastFocusedElement?.focus()',
  ]) assert.ok(settingsShellSource.includes(token), `shared settings focus contract lost ${token}`)
  assert.match(settingsSource, /<VisualSettingsShell[\s\S]*?@close="handleClose"/)
  assert.match(settingsSource, /import VisualSettingsShell from '.\/components\/VisualSettingsShell\.vue'/)
  assert.equal(settingsSource.includes('settingsSearchInputRef'), false)
})

test('closing a cold settings route has a deterministic in-app fallback', () => {
  assert.match(settingsSource, /router\.options\.history\.state\.back/)
  assert.match(settingsSource, /previousRoutePath !== '\/platform\/settings'/)
  assert.match(settingsSource, /router\.replace\('\/platform\/knowledge-bases'\)/)
})
