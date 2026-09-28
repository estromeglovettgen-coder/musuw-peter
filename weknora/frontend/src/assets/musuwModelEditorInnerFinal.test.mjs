import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const css = read('./musuw-model-editor-inner-final.css')
const bridge = read('./musuw-tdesign-overlay-bridge.css')

test('model editor inner bridge loads after the common SettingDrawer visual layer', () => {
  const i = main.indexOf('musuw-model-editor-inner-final.css')
  assert.ok(i > main.indexOf('musuw-reference-precision-fixes.css'))
  assert.ok(i > main.indexOf('musuw-kb-editor-inner-final.css'))
})

test('model type/source/provider controls use reference ink/gray instead of brand blue', () => {
  for (const token of [
    '.setting-drawer .model-type-option.is-active',
    'background: #111827 !important',
    '.setting-drawer .source-option.is-active',
    '.setting-drawer .t-input.t-is-focused',
    '.setting-drawer .status-icon.available',
  ]) assert.ok(css.includes(token), `model editor visual token missing: ${token}`)
  for (const token of [
    'body .t-select__dropdown:not(.org-select-dropdown-popup):not(.share-org-select-popup):not(.sandbox-backend-popup):not(.sandbox-config-select-popup):not(.tenant-members-role-select-popup)',
    'border-radius: 16px !important',
    'padding: 8px 12px !important',
    'font-size: 12px !important',
  ]) assert.ok(bridge.includes(token), `model editor select must use shared overlay bridge token: ${token}`)
  assert.doesNotMatch(css, /provider-select-popup[\s\S]*?(?:border-radius|box-shadow|padding):/)
})

test('semantic success/warning/error states remain distinct while business stays untouched', () => {
  assert.ok(css.includes('#047857'))
  assert.ok(css.includes('#dc2626'))
  assert.ok(css.includes('#f59e0b'))
  for (const forbidden of ['@click', 'checkRemoteAPI', 'downloadOllamaModel', 'emit(', 'router.', 'store.', 'api/']) {
    assert.equal(css.includes(forbidden), false, `business behavior leaked into model editor CSS: ${forbidden}`)
  }
})
