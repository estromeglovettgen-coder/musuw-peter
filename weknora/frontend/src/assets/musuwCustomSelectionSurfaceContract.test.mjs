import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const bridge = read('./musuw-tdesign-overlay-bridge.css')
const qaPanel = read('./musuw-qapanel-reference-final.css')
const directory = read('./musuw-native-directory-reference.css')
const finalTheme = read('./musuw-final-theme-closure.css')
const generalSettings = read('../views/settings/GeneralSettings.vue')
const source = (path) => read(`../${path}`)

const customSurfaceStart = bridge.indexOf('/* Ordinary Lite custom selectors')
const customSurfaceEnd = bridge.indexOf('/* Reference controls are neutral/black')
const customSurface = bridge.slice(customSurfaceStart, customSurfaceEnd)

test('ordinary Lite selectors use the scene-model chrome seam', () => {
  assert.ok(customSurfaceStart >= 0, 'custom selector seam marker is missing')
  assert.ok(customSurfaceEnd > customSurfaceStart, 'custom selector seam must have a bounded section')

  for (const selector of [
    'body .t-popup__content:has(> .template-popup)',
    'body .t-popup__content:has(> .kb-activity-filter-menu)',
    'body .tag-filter-popup .t-popup__content',
    'body .visual-tag-filter-popup .t-popup__content',
    'body .language-switch > button',
    'body .language-dropdown',
    'body .language-option',
    'body .kb-activity-filter-option',
    'body .tag-filter-chip',
    'body .visual-tag-filter__chip',
    'body .kb-activity-filter-trigger',
    'body .doc-tag-filter-trigger',
    'body .integrations-agent-filter-popup .t-dropdown__menu',
    'body .template-item',
  ]) assert.ok(customSurface.includes(selector), `custom selector seam missing: ${selector}`)

  for (const token of [
    'border-radius: 16px !important',
    'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%) !important',
    'min-height: 36px !important',
    'padding: 8px 12px !important',
    'font-size: 12px !important',
    'line-height: 16px !important',
    'background: #f9fafb !important',
    'background: #f3f4f6 !important',
  ]) assert.ok(customSurface.includes(token), `canonical custom selector token missing: ${token}`)
})

test('custom selector seam never changes placement, scrolling, or interaction', () => {
  for (const property of ['position:', 'top:', 'right:', 'bottom:', 'left:', 'z-index:', 'overflow:', 'max-height:', '@click', 'router.', 'store.', 'fetch(']) {
    const declaration = property.startsWith('@') || property.endsWith('(')
      ? new RegExp(property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      : new RegExp(`(?:^|\\n)\\s*${property.replace(':', '\\s*:')}`)
    assert.doesNotMatch(customSurface, declaration, `visual seam must not own ${property}`)
  }
})

test('homepage chat and excluded tenant/share/sandbox surfaces are outside the new seam', () => {
  for (const forbidden of [
    'visual-chat-composer',
    'visual-model-selector__chat',
    'visual-mention',
    'visual-kb-selector',
    'visual-kb-option',
    'visual-kb-switcher',
    'source-switcher-card',
    'source-switcher-row',
    'session-group-card',
    'session-group-row',
    'visual-session-filter',
    'tenant-dropdown',
    'visual-user-tenant-submenu',
    'TenantSelector',
    'org-select-dropdown-popup',
    'share-org-select-popup',
    'sandbox-backend-popup',
    'sandbox-config-select-popup',
    'tenant-members-role-select-popup',
  ]) {
    assert.equal(customSurface.includes(forbidden), false, `excluded surface leaked into bridge: ${forbidden}`)
  }

  const inputField = source('components/Input-field.vue')
  assert.match(inputField, /class="visual-chat-composer"/)
  assert.doesNotMatch(inputField, /<t-select|<t-dropdown/, 'homepage composer must keep custom picker, not bridge-owned TDesign select')
  assert.match(inputField, /class="visual-chat-composer__combined-picker"/)
  assert.match(inputField, /<MentionSelector/)
  assert.match(inputField, /<KnowledgeBaseSelector/)

  const mention = source('components/MentionSelector.vue')
  assert.match(mention, /class="visual-mention-menu"/)
  assert.match(mention, /overlay-class-name="visual-mention-detail-popup"/)
  assert.match(qaPanel, /\.visual-mention-menu\s*\{[\s\S]*border-radius:\s*12px\s*!important/)
  assert.match(qaPanel, /\.visual-mention-list\s*\{[\s\S]*padding:\s*8px\s*!important/)

  for (const token of [
    'padding: 8px !important',
    'border-radius: 14px !important',
    'box-shadow: 0 14px 34px rgb(15 23 42 / 14%) !important',
    'min-height: 42px !important',
    'padding: 6px 8px !important',
    'border-radius: 9px !important',
  ]) assert.ok(directory.includes(token), `tenant native contract changed: ${token}`)

  const share = source('components/ShareKnowledgeBaseDialog.vue')
  const sandbox = source('components/SandboxConfigEditorDrawer.vue')
  assert.match(share, /overlayClassName: 'org-select-dropdown-popup'/)
  assert.match(share, /padding: 6px 12px/)
  assert.match(sandbox, /overlayClassName: 'sandbox-backend-popup'/)
  assert.match(sandbox, /min-height: 44px/)
})

test('native TDesign bridge protects excluded popup classes and keeps one trigger inset owner', () => {
  for (const excluded of [
    ':not(.org-select-dropdown-popup)',
    ':not(.share-org-select-popup)',
    ':not(.sandbox-backend-popup)',
    ':not(.sandbox-config-select-popup)',
    ':not(.tenant-members-role-select-popup)',
  ]) assert.ok(bridge.includes(excluded), `native bridge exclusion missing: ${excluded}`)

  const triggerWrappers = bridge.match(/\.t-select-input\s*\{([\s\S]*?)\n\}/g) || []
  assert.ok(triggerWrappers.length > 0)
  for (const wrapper of triggerWrappers) {
    assert.match(wrapper, /padding:\s*0\s*!important;/)
    assert.doesNotMatch(wrapper, /padding:\s*8px\s+14px/)
  }
  assert.match(bridge, /\.t-select-input \.t-input\s*\{[\s\S]*padding:\s*8px 14px\s*!important;/)
})

test('rich ordinary selectors keep interaction-specific constraints', () => {
  const login = source('views/auth/Login.vue')
  const activity = source('views/knowledge/settings/KnowledgeBaseActivitySettings.vue')
  const faq = source('views/knowledge/components/FAQEntryManager.vue')
  const promptSelector = source('components/PromptTemplateSelector.vue')
  const integrations = source('components/IntegrationsAgentFilter.vue')

  assert.match(login, /class="language-dropdown"/)
  assert.match(login, /class="language-option"/)
  assert.match(login, /\.language-dropdown\s*\{[\s\S]*position:\s*absolute[\s\S]*overflow:\s*hidden/)
  assert.match(activity, /class="kb-activity-filter-menu"/)
  assert.match(activity, /\.kb-activity-filter-menu\s*\{[\s\S]*max-height:\s*min\(360px,\s*60vh\)/)
  assert.match(activity, /\.kb-activity-filter-options\s*\{[\s\S]*overflow-y:\s*auto/)
  assert.match(faq, /overlay-class-name="tag-filter-popup"/)
  assert.match(faq, /class="tag-filter-chip"/)
  assert.match(faq, /\.tag-filter-panel__body\s*\{[\s\S]*overflow-y:\s*auto/)
  assert.match(promptSelector, /class="template-list"/)
  assert.match(promptSelector, /overflow-y:\s*auto/)
  assert.match(promptSelector, /max-height:\s*400px/)
  assert.match(integrations, /popup-props/)
  assert.match(integrations, /integrations-agent-filter-popup/)
})

test('GeneralSettings remains the canonical custom selector reference', () => {
  for (const token of [
    '.visual-general-settings__select-control',
    '.visual-general-settings__select-dropdown',
    '.visual-general-settings__select-option',
    'min-height: 36px',
    'padding: 8px 14px',
    'border-radius: 12px',
    'padding: 6px',
    'border-radius: 16px',
    'padding: 8px 12px',
    'background: #f9fafb',
    'background: #f3f4f6',
  ]) assert.ok(generalSettings.includes(token), `GeneralSettings canonical token missing: ${token}`)
})

test('ordinary Lite dark closure excludes homepage and tenant/share/sandbox selectors', () => {
  for (const selector of [
    ':root[theme-mode="dark"] body .t-popup__content:has(> .template-popup)',
    ':root[theme-mode="dark"] body .t-popup__content:has(> .kb-activity-filter-menu)',
    ':root[theme-mode="dark"] body .language-dropdown',
    ':root[theme-mode="dark"] body .tag-filter-chip.active',
    ':root[theme-mode="dark"] body .visual-tag-filter__chip.is-active',
    'background: var(--mvc-hover) !important',
    'color: var(--mvc-text-strong) !important',
  ]) assert.ok(finalTheme.includes(selector), `dark selector closure missing: ${selector}`)

  for (const forbidden of [
    ':root[theme-mode="dark"] body .t-popup__content:has(> .source-switcher-card)',
    ':root[theme-mode="dark"] body .t-popup__content:has(> .session-group-card)',
    ':root[theme-mode="dark"] body .source-switcher-row',
    ':root[theme-mode="dark"] body .session-group-row',
  ]) assert.equal(finalTheme.includes(forbidden), false, `excluded dark selector leaked: ${forbidden}`)
})
