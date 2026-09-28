import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const css = read('./musuw-kb-editor-inner-final.css')

test('KB editor inner bridge is loaded after the rebuilt shell and preview layers', () => {
  const i = main.indexOf('musuw-kb-editor-inner-final.css')
  assert.ok(i > main.indexOf('musuw-reachable-surface-final.css'))
  assert.ok(i > main.indexOf('musuw-document-preview-final.css'))
})

test('native KB settings forms/cards/tables use the reference grayscale visual grammar', () => {
  for (const token of [
    '.settings-modal .section-header',
    '.settings-modal .setting-row',
    '.settings-modal .strategy-info-panel',
    '.settings-modal .t-slider__track',
    '.settings-modal .ds-card',
    '.settings-modal .share-panel-table-shell',
    'background: #111827 !important',
  ]) assert.ok(css.includes(token), `KB editor inner token missing: ${token}`)
})

test('inner bridge does not take ownership of Graph/Trace renderers or business behavior', () => {
  for (const forbidden of [
    '@click', 'router.', 'store.', 'api/', 'fetch(', 'emit(',
    '.trace-', '.knowledge-processing-timeline', '.wiki-graph', '.tree-container', '.agent-stream-display',
    '.graph-canvas', '.topology-graph',
  ]) assert.equal(css.includes(forbidden), false, `forbidden token leaked into KB editor inner CSS: ${forbidden}`)
})
