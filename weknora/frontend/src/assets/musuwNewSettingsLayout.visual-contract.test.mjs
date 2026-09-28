import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
const memory = read('../views/settings/MemorySettings.vue')
const agent = read('../views/agent/AgentEditorModal.vue')
const bridge = read('./musuw-settings-reference-inner.css')

test('Memory and Agent secondary navigation reuse the compact Musuw settings tabs', () => {
  assert.match(memory, /class="visual-model-tabs memory-status-tabs"/)
  assert.match(memory, /class="visual-model-tabs__item"/)
  assert.doesNotMatch(memory, /<t-tabs[^>]*class="status-tabs"/)

  assert.match(agent, /class="visual-model-tabs suggestion-tabs"/)
  assert.match(agent, /class="visual-model-tabs__item"/)
  assert.doesNotMatch(agent, /<t-tabs[^>]*class="suggestion-tabs"/)

  assert.match(bridge, /\.visual-settings-content \.visual-model-tabs\s*\{/)
  assert.match(bridge, /\.visual-settings-content \.visual-model-tabs__item\.is-active::after/)
})

test('Agent prompt navigation is governed by the VisualSettingsShell bridge', () => {
  assert.match(bridge, /\.visual-settings-content \.prompts-outline__pill/)
  assert.match(bridge, /\.visual-settings-content \.prompts-outline__pill--active/)
})

test('Agent tool choices are unboxed settings rows instead of an upstream card grid', () => {
  assert.match(agent, /\.tools-overview\s*\{[\s\S]*?background: transparent;[\s\S]*?border-bottom: 1px solid/)
  assert.match(agent, /\.tool-grid\s*\{[\s\S]*?flex-direction: column;[\s\S]*?gap: 0;/)
  assert.match(agent, /\.tool-card\s*\{[\s\S]*?border: 0;[\s\S]*?border-bottom: 1px solid/)
  assert.match(agent, /&\.t-is-checked\s*\{\s*background: transparent;/)
  assert.doesNotMatch(agent, /\.tool-grid\s*\{[^}]*grid-template-columns:/)
})

test('vertical setting rows do not inherit the 280px horizontal control basis', () => {
  assert.match(
    bridge,
    /\.visual-settings-content \.setting-row\.setting-row-vertical > \.setting-control[\s\S]*?flex: 0 0 auto !important;[\s\S]*?max-width: none !important;/,
  )
})

test('new Standard knowledge and integration surfaces use the compact Musuw card scale', () => {
  for (const token of [
    '.provider-card',
    '.ds-card',
    '.node-item',
    '.relation-item',
    '.provider-card__badge',
    '.ds-card__badge',
    '.provider-grid',
    '.ds-grid',
    '.strategy-info-panel',
  ]) {
    assert.ok(bridge.includes(token), `${token} must be governed by the shared settings bridge`)
  }

  assert.match(bridge, /\.visual-settings-content :is\(\.provider-card__badge,\.ds-card__badge,[^)]*\)[\s\S]*?width: 32px !important;/)
  assert.match(bridge, /\.visual-settings-content :is\(\.provider-grid,\.ds-grid,[^)]*\)[\s\S]*?minmax\(240px, 1fr\)/)
  assert.match(bridge, /\.visual-settings-content \.strategy-info-panel[\s\S]*?border-left: 0 !important;/)
})

test('resource add actions keep their dashed affordance in light and dark settings', () => {
  const addSelector = ':is(.provider-card--add,.ds-card--add,.backend-card--add,.store-card--add)'
  assert.ok(bridge.includes(addSelector))
  assert.match(bridge, /Resource creation remains an action[\s\S]*?border-style: dashed !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/)
  assert.match(bridge, /:root\[theme-mode="dark"\] \.visual-settings-content :is\(\.provider-card--add,[^)]+\)[\s\S]*?border-style: dashed !important;[\s\S]*?background: transparent !important;/)
})

test('dark Agent tags and disabled Memory rows retain their state semantics', () => {
  assert.match(bridge, /:root\[theme-mode="dark"\] \.visual-settings-content :is\(\.prompts-outline__pill,\.placeholder-tag,\.detail-tag,\.scope-chip\)[\s\S]*?background: var\(--mvc-surface-raised,[^)]+\) !important;[\s\S]*?color: var\(--mvc-text-muted,[^)]+\) !important;/)
  assert.match(bridge, /\.visual-settings-content \.memory-workspace-settings \.setting-row\.is-disabled \.setting-info :is\(label,\.desc\)[\s\S]*?color: var\(--td-text-color-disabled,[^)]+\) !important;/)
  assert.match(bridge, /:root\[theme-mode="dark"\] \.visual-settings-content \.memory-workspace-settings \.setting-row\.is-disabled \.setting-info :is\(label,\.desc\)[\s\S]*?color: var\(--mvc-text-muted,[^)]+\) !important;/)
})

test('Memory Advanced is an unboxed left-aligned disclosure row', () => {
  assert.match(bridge, /\.visual-settings-content \.memory-workspace-settings \.advanced-toggle\s*\{[\s\S]*?justify-content: flex-start !important;[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;[\s\S]*?text-align: left !important;/)
  assert.match(bridge, /\.visual-settings-content \.memory-workspace-settings \.advanced-toggle-copy\s*\{[\s\S]*?align-items: flex-start !important;/)
})

test('dark settings switches keep a visible track and checked state', () => {
  assert.match(bridge, /:root\[theme-mode="dark"\] \.visual-settings-content \.t-switch\s*\{\s*background: #3f3f46 !important;/)
  assert.match(bridge, /:root\[theme-mode="dark"\] \.visual-settings-content \.t-switch\.t-is-checked\s*\{\s*background: #f4f4f5 !important;/)
  assert.match(bridge, /:root\[theme-mode="dark"\] \.visual-settings-content \.t-switch\.t-is-checked \.t-switch__handle::before\s*\{\s*background: #18181b !important;/)
})
