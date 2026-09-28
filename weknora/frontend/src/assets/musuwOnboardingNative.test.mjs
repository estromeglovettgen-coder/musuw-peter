import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const css = read('./musuw-onboarding-native.css')

test('onboarding/image-preview closure loads after teleported overlay bridge', () => {
  const i = main.indexOf('musuw-onboarding-native.css')
  assert.ok(i > main.indexOf('musuw-tdesign-overlay-bridge.css'))
  assert.ok(i > main.indexOf('musuw-reachable-surface-final.css'))
})

test('tenantless workspace surface uses reference-family grayscale geometry', () => {
  for (const token of [
    '.workspace-onboarding',
    'width: min(448px, 100%) !important',
    'border-radius: 24px !important',
    'background: #111827 !important',
    '.workspace-actions .t-button--theme-primary',
    '.logout-link:hover',
    'body .t-dialog:has(.create-tenant-dialog-header)',
  ]) assert.ok(css.includes(token), `onboarding visual token missing: ${token}`)
})

test('native image viewer behavior remains vendor-owned while its chrome is normalized', () => {
  for (const token of [
    'body .t-image-viewer__dialog.t-dialog__ctx',
    'body .t-image-viewer__dialog .t-dialog__wrap',
    'body .t-image-viewer__dialog .t-image-viewer__modal-image',
    'body .t-image-viewer__dialog .t-image-viewer__utils',
    'body .t-image-viewer__dialog .t-image-viewer__modal-icon',
  ]) assert.ok(css.includes(token), `image viewer visual token missing: ${token}`)
})

test('onboarding closure owns no behavior or excluded renderers', () => {
  for (const forbidden of [
    '@click', 'router.', 'store.', 'api/', 'fetch(', 'emit(',
    '.trace-', '.knowledge-processing-timeline', '.wiki-graph', '.tree-container', '.agent-stream-display',
  ]) assert.equal(css.includes(forbidden), false, `forbidden token leaked into onboarding CSS: ${forbidden}`)
})
