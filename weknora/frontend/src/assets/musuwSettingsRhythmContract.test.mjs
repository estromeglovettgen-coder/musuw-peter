import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const reference = read('./musuw-settings-reference-inner.css')
const reachable = read('./musuw-reachable-surface-final.css')

test('shared settings bridge keeps the authority modal and row rhythm', () => {
  assert.match(reference, /height: 620px !important;/)
  assert.match(reference, /flex: 0 0 192px !important;/)
  assert.match(reference, /@media \(min-width: 1024px\)[\s\S]*?width: min\(1024px, 100%\) !important;/)
  const sharedRows = reference.match(/\.visual-settings-content \.setting-row,[\s\S]*?\n\}/)?.[0] || ''
  assert.match(sharedRows, /padding: 14px 0 !important;/)
  assert.match(sharedRows, /display: flex !important;/)
  assert.doesNotMatch(sharedRows, /display: grid !important;/)
  const sharedLabels = reference.match(/\.visual-settings-content \.setting-info label,[\s\S]*?\.settings-overlay > \.settings-modal \.form-label \{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(sharedLabels, /font-size: 14px !important;\s*\n\s*line-height: 20px !important;\s*\n\s*font-weight: 600 !important;/)
  assert.doesNotMatch(sharedLabels, /font-size: 12px !important;/)
  assert.doesNotMatch(sharedRows, /font-size: 11px !important;/)
  assert.doesNotMatch(reachable, /height: 520px !important;/)
  assert.doesNotMatch(reachable, /flex: 0 0 224px !important;/)
  assert.match(reachable, /@media \(min-width: 1024px\)[\s\S]*?width: min\(1024px, 100%\) !important;/)
})

test('prompt settings use transparent panel chrome and a solid authority textarea', () => {
  const prompt = reference.slice(reference.indexOf('/* Agent prompt pane'))
  assert.match(prompt, /\.agent-editor-content \.prompts-panel__header[\s\S]*?background: transparent !important;/)
  assert.match(prompt, /\.agent-editor-content \.prompts-panel__body[\s\S]*?background: transparent !important;/)
  assert.match(prompt, /\.agent-editor-content \.prompts-panel \.setting-row[\s\S]*?border-bottom: 0 !important;/)
  assert.match(prompt, /\.agent-editor-content \.system-prompt-textarea[\s\S]*?background: #fff !important;/)
  assert.match(prompt, /:root\[theme-mode="dark"\] \.agent-editor-content \.system-prompt-textarea[\s\S]*?background: rgb\(39 39 42 \/ 80%\) !important;/)
  assert.match(prompt, /\.agent-editor-content \.system-prompt-textarea[\s\S]*?border: 1px solid #e5e7eb !important;/)
  assert.doesNotMatch(prompt, /border[^;]*dashed/)
})
