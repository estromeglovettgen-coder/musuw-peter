import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const css = read('./musuw-reachable-surface-final.css')

test('reachable surface closure is active after reference-specific layers', () => {
  const i = main.indexOf('musuw-reachable-surface-final.css')
  assert.ok(i > main.indexOf('musuw-reference-precision-fixes.css'))
  assert.ok(i > main.indexOf('musuw-reference-lucide-precision.css'))
})

test('KnowledgeBase create modal is content-driven and reuses shared TDesign field styling', () => {
  for (const token of [
    '.settings-overlay:has(.settings-modal--compact)',
    'background: rgb(0 0 0 / 40%) !important',
    'width: min(448px, 100%) !important',
    'max-width: 448px !important',
    'height: auto !important',
    'min-height: 0 !important',
    'max-height: calc(100dvh - 32px) !important',
    'border-radius: 16px !important',
    'padding: 22px 24px 14px !important',
    '--mvs-folder-plus:',
    'background: #111827 !important',
  ]) assert.ok(css.includes(token), `KB create reference token missing: ${token}`)
})

test('native KB editor reuses SettingsModal visual shell without changing behavior', () => {
  for (const token of [
    '.settings-modal:not(.settings-modal--compact)',
    'width: min(896px, 100%) !important',
    'height: 620px !important',
    'border-radius: 24px !important',
    'flex: 0 0 192px !important',
    'padding: 24px !important',
    '.nav-item.active',
  ]) assert.ok(css.includes(token), `KB editor shell token missing: ${token}`)
})

test('share, document detail, file drop and message surfaces no longer expose legacy brand chrome', () => {
  for (const token of [
    '.upload-mask',
    'body .t-dialog:has(.share-form)',
    'body .doc-main-drawer.t-drawer > .t-drawer__content-wrapper',
    'body .t-message',
    '.org-select-dropdown-popup.t-select__dropdown',
  ]) assert.ok(css.includes(token), `reachable surface missing: ${token}`)
})

test('closure stylesheet contains no business or excluded renderer ownership', () => {
  for (const forbidden of [
    '@click', 'router.', 'store.', 'api/', 'fetch(', 'emit(',
    '.knowledge-processing-timeline', '.trace-', '.wiki-graph', '.tree-container', '.agent-stream-display',
  ]) assert.equal(css.includes(forbidden), false, `forbidden behavior/renderer token leaked into reachable UI CSS: ${forbidden}`)
})
