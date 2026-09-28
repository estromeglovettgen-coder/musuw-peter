import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const precision = read('./musuw-reference-precision-fixes.css')

test('reference precision sheet loads after the general visual convergence layer', () => {
  assert.ok(main.indexOf('musuw-reference-precision-fixes.css') > main.indexOf('musuw-visual-contract-final.css'))
})

test('OnlineKnowledgeEditorDrawer reference geometry and accent tokens are authoritative', () => {
  for (const token of [
    'background: rgb(0 0 0 / 40%) !important',
    'width: min(672px, 100vw) !important',
    'padding: 16px 24px !important',
    'flex: 0 0 40px !important',
    'background: #e6f4ff !important',
    'color: #1677ff !important',
    'font-size: 15px !important',
    'padding: 0 24px !important',
    'font-size: 12px !important',
    'border-color: #1677ff !important',
    'min-height: 380px !important',
    'max-height: 55vh !important',
    'padding: 14px 24px !important',
    'background: #fafafa !important',
  ]) assert.ok(precision.includes(token), `reference editor precision token missing: ${token}`)
})

test('reference surface typography is isolated from user font overrides', () => {
  assert.ok(precision.includes('--app-font-family: "Inter Variable", "Inter", "Noto Sans SC Variable", "Noto Sans SC"'))
  assert.ok(precision.includes('--app-font-family-mono: "JetBrains Mono Variable", "JetBrains Mono"'))
})

test('Musuw-only dialogs keep behavior but use reference-family grayscale chrome', () => {
  for (const token of [
    '.global-invitation-bell__btn',
    'body .t-dialog:has(.my-invitations-desc)',
    'body .setting-drawer .t-drawer',
    'background: #111827 !important',
  ]) assert.ok(precision.includes(token), `native visual adaptation missing: ${token}`)
})

test('precision layer does not style excluded graph or trace internals', () => {
  for (const forbidden of [
    '.wiki-graph',
    '.tree-container',
    '.knowledge-processing-timeline',
    '.trace-',
    '.agent-stream-display',
  ]) assert.equal(precision.includes(forbidden), false, `excluded renderer leaked into precision layer: ${forbidden}`)
})
