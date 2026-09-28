import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const finalTheme = readFileSync(new URL('./musuw-final-theme-closure.css', import.meta.url), 'utf8')
const theme = readFileSync(new URL('./theme/theme.css', import.meta.url), 'utf8')
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('dark knowledge pages close native list, document and filter surfaces', () => {
  for (const selector of [
    '.visual-folder-tree',
    '.visual-folder-card',
    '.visual-knowledge-toolbar',
    '.visual-knowledge-path-pill',
    '.visual-knowledge-filter-button',
    '.visual-knowledge-view-toggle',
    '.visual-reference-kb-card__title strong',
    '.visual-knowledge-select-popup',
    '.wiki-graph-search-dropdown',
  ]) {
    assert.match(
      finalTheme,
      new RegExp(`${escapeRegex(selector)}[^\\{]*\\{[\\s\\S]*background(?:-color)?: var\\(--mvc-`),
      `dark final theme must own the background for ${selector}`,
    )
  }
})

test('dark graph tab supplies semantic TDesign surfaces instead of light defaults', () => {
  const graphDarkBlock = theme.match(
    /:root\[theme-mode="dark"\] \.visual-knowledge-page\.is-graph-tab\s*\{([\s\S]*?)\n\}/,
  )?.[1] || ''

  assert.match(graphDarkBlock, /--td-bg-color-page:\s*var\(--musuw-canvas\)/)
  assert.match(graphDarkBlock, /--td-bg-color-container:\s*var\(--musuw-surface\)/)
  assert.match(graphDarkBlock, /--td-bg-color-container-hover:\s*var\(--musuw-surface-hover\)/)
  assert.match(graphDarkBlock, /--td-component-stroke:\s*var\(--musuw-line\)/)
  assert.match(graphDarkBlock, /--td-text-color-primary:\s*var\(--musuw-ink\)/)
})

test('dark graph search select owns its nested input surface', () => {
  assert.match(
    finalTheme,
    /\.visual-knowledge-page\.is-graph-tab\s+\.graph-search-select[\s\S]*?\.t-input[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/,
    'dark closure must override the graph select input instead of leaving the white TDesign default',
  )
  assert.match(
    finalTheme,
    /\.visual-knowledge-page\.is-graph-tab\s+\.graph-search-select[\s\S]*?\.t-input[\s\S]*?border-color:\s*var\(--mvc-line\)\s*!important;/,
    'dark closure must override the graph select border instead of leaving the light default',
  )
})

test('dark general settings raises the open custom select above sibling rows', () => {
  assert.match(
    finalTheme,
    /\.visual-general-settings__select:has\(\.visual-general-settings__select-dropdown\)[^\{]*\{[\s\S]*?z-index:\s*3;/,
    'dark closure must raise the open General select root, not only its child menu',
  )
})

test('dark knowledge tabs and breadcrumbs keep icons and hover controls readable', () => {
  assert.match(
    finalTheme,
    /\.visual-knowledge-tabs button \.t-icon[^\{]*\{[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/,
    'dark closure must lift inactive Knowledge Base tab icons out of the legacy navy color',
  )
  assert.match(
    finalTheme,
    /\.visual-knowledge-tabs button\.is-active \.t-icon[^\{]*\{[\s\S]*?color:\s*var\(--mvc-text-strong\)\s*!important;/,
    'dark closure must keep the active Knowledge Base tab icon on the active text token',
  )
  assert.match(
    finalTheme,
    /\.visual-knowledge-breadcrumb__back:hover[^\{]*\{[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/,
    'dark closure must avoid the light black hover fill on the breadcrumb back control',
  )
  assert.match(
    finalTheme,
    /\.visual-knowledge-breadcrumb__current:hover:not\(:disabled\)[^\{]*\{[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/,
    'dark closure must avoid the light hover fill on the current breadcrumb control',
  )
  assert.match(
    finalTheme,
    /\.visual-folder-card__icon[^\{]*\{[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/,
    'dark closure must lift folder-card icons out of the legacy dark navy color',
  )
  assert.match(
    finalTheme,
    /\.visual-document-card__file-icon[^\{]*\{[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/,
    'dark closure must lift document-card icons out of the legacy dark navy color',
  )
})

test('dark graph SVG labels and active ring stay visible on the dark canvas', () => {
  assert.match(
    finalTheme,
    /\.visual-knowledge-page\.is-graph-tab\s+\.wiki-graph-canvas\s+svg\s+text[^\{]*\{[\s\S]*?fill:\s*var\(--mvc-text-strong\)\s*!important;/,
    'dark closure must override hard-coded graph label text that is too dark for the canvas',
  )
  assert.match(
    finalTheme,
    /\.visual-knowledge-page\.is-graph-tab\s+\.wiki-graph-canvas\s+svg\s+\.node-active-ring[^\{]*\{[\s\S]*?stroke:\s*var\(--mvc-line-strong\)\s*!important;/,
    'dark closure must replace the near-black active ring on the graph canvas',
  )
})
