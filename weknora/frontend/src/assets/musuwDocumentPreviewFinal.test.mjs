import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const css = read('./musuw-document-preview-final.css')

test('document preview visual layer is active after native overlay closure', () => {
  const i = main.indexOf('musuw-document-preview-final.css')
  assert.ok(i > main.indexOf('musuw-onboarding-native.css'))
  assert.ok(i > main.indexOf('musuw-tdesign-overlay-bridge.css'))
})

test('preview toolbar, states and rich content containers use reference-family chrome', () => {
  for (const token of [
    '.document-preview .preview-toolbar',
    'border-radius: 10px !important',
    '.document-preview .preview-loading',
    '.document-preview .preview-pdf',
    '.document-preview .preview-markdown',
    '.document-preview .preview-text .code-preview',
    'font-family: var(--app-font-family-mono) !important',
    '.document-preview.is-fullscreen',
  ]) assert.ok(css.includes(token), `document preview token missing: ${token}`)
})

test('document preview closure does not alter parsing/fetch/fullscreen logic or trace/graph renderers', () => {
  for (const forbidden of [
    '@click', 'previewKnowledgeFile', 'previewTemporaryAttachment', 'toggleFullscreen(', 'fetch(', 'emit(',
    '.trace-', '.knowledge-processing-timeline', '.wiki-graph', '.tree-container', '.agent-stream-display',
  ]) assert.equal(css.includes(forbidden), false, `forbidden behavior/renderer token leaked into preview CSS: ${forbidden}`)
})
