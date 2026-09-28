import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('./musuw-visual.less')
const finalCss = read('./musuw-visual-contract-final.css')

const importedAfter = (later, earlier) => {
  const a = main.indexOf(later)
  const b = main.indexOf(earlier)
  assert.ok(a > b, `${later} must load after ${earlier}`)
}

test('final visual-contract layer is active after shared vendor primitives', () => {
  importedAfter('musuw-visual-contract-final.css', 'musuw-ui-primitives.css')
  assert.equal(main.includes('musuw-reference-mechanical.css'), false)
})

test('high-visibility reference glyphs use the source Lucide geometry masks', () => {
  for (const token of [
    '--mvc-icon-search:',
    '--mvc-icon-message-plus:',
    '--mvc-icon-folder:',
    '--mvc-icon-chevron-left:',
    '--mvc-icon-chevron-right:',
    '--mvc-icon-ellipsis:',
    '--mvc-icon-send:',
    '--mvc-icon-x:',
    '.visual-sidebar__header-actions .visual-sidebar__header-icon:first-child::before',
    '.visual-sidebar__collapsed-nav.is-new::before',
    '.visual-chat-composer__send:not(.is-stop)::before',
  ]) assert.ok(finalCss.includes(token), `missing final reference-glyph contract: ${token}`)
})

test('native Command Palette keeps behavior but no longer exposes the old brand-color visual language', () => {
  const palette = read('../components/GlobalCommandPalette.vue')
  for (const behavior of [
    "commandPaletteStore.openPalette('')",
    "if (isCmd && e.key.toLowerCase() === 'k')",
    "primaryActionForSelected({ cmd: e.metaKey || e.ctrlKey })",
    'useCmdkSearch({',
    'buildCommands({',
  ]) assert.ok(palette.includes(behavior), `Command Palette lost native behavior: ${behavior}`)

  for (const visual of [
    '.cmdk-dialog .t-dialog',
    'border-radius: 20px !important',
    '.cmdk-item--selected,',
    'background: var(--mvc-ink-100) !important',
    '.cmdk-retrieval-drawer .t-drawer',
  ]) assert.ok(finalCss.includes(visual), `Command Palette visual convergence missing: ${visual}`)
})

test('final convergence layer does not target excluded Graph/Trace renderers', () => {
  for (const forbidden of [
    '.wiki-graph',
    '.tree-container',
    '.knowledge-processing-timeline',
    '.trace-',
    '.agent-stream-display',
  ]) assert.equal(finalCss.includes(forbidden), false, `excluded implementation leaked into final visual layer: ${forbidden}`)
})
