import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('sidebar keeps the reference 256px expanded and 56px collapsed geometry', () => {
  const source = read('../components/menu.vue')
  assert.match(source, /\.visual-sidebar\s*\{[^}]*width:\s*256px;[^}]*min-width:\s*256px;/)
  assert.match(source, /\.visual-sidebar\.is-collapsed\s*\{[^}]*width:\s*56px;[^}]*min-width:\s*56px;[^}]*padding:\s*14px 8px;/)
  assert.match(source, /\.visual-sidebar__collapsed-logo\s*\{[^}]*flex:\s*0 0 32px;[^}]*width:\s*32px;[^}]*height:\s*32px;/)
})

test('knowledge detail shell and document toolbar follow the exported reference geometry', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  const closure = read('./musuw-document-list-reference-final.css')
  const layout = read('../views/knowledge/components/knowledge-base-layout.less')
  assert.ok(source.includes("@import './components/knowledge-base-layout.less';"))
  assert.ok(read('../views/marketplace/MarketplaceKnowledgeBase.vue').includes("@import '../knowledge/components/knowledge-base-layout.less';"))

  // KnowledgeBase.tsx: p-5 md:p-7.
  assert.ok(closure.includes('.visual-knowledge-page {\n  padding: 20px !important;'))
  assert.ok(closure.includes('@media (min-width: 768px)'))
  assert.ok(closure.includes('.visual-knowledge-page { padding: 28px !important; }'))

  // Header/tabs: pb-4, rounded-xl, p-1, px-3.5 py-1.5, 14px glyphs.
  assert.ok(layout.includes('padding-bottom: 16px;'))
  assert.ok(layout.includes('border-bottom: 1px solid rgb(229 231 235 / 80%)'))
  assert.ok(layout.includes('.visual-knowledge-tabs { flex: 0 0 auto; align-self: flex-start; padding: 4px;'))
  assert.ok(layout.includes('border-radius: 12px;'))
  assert.ok(layout.includes('.visual-knowledge-tabs button { min-height: 30px; padding: 6px 14px;'))
  assert.ok(layout.includes('.visual-knowledge-tabs button :deep(.t-icon) { font-size: 14px;'))

  // DocumentListView.tsx toolbar: p-2.5, gap-2.5, rounded-2xl, search max-w-220.
  assert.ok(source.includes('.visual-knowledge-toolbar { flex: 0 0 auto; padding: 10px;'))
  assert.ok(source.includes('justify-content: space-between; gap: 10px;'))
  assert.ok(source.includes('.visual-knowledge-search { min-width: 90px; max-width: 220px;'))
  assert.ok(source.includes('trigger-icon="add"'))

  // p-0.5 wrapper + p-1.5 + 14px icon => 26px visual button.
  assert.ok(source.includes('.visual-knowledge-view-toggle { padding: 2px;'))
  assert.ok(closure.includes('.visual-knowledge-view-toggle button {\n  width: 26px !important;'))
  assert.ok(closure.includes('height: 26px !important;'))
})

test('directory uses the reference 224px expanded rail while preserving the native collapse control', () => {
  const tree = read('../views/knowledge/components/KbFolderTree.vue')
  assert.ok(tree.includes('flex: 0 0 224px;'))
  assert.ok(tree.includes('width: 224px;'))
  assert.ok(tree.includes('.visual-folder-tree.is-collapsed'))
  assert.ok(tree.includes('width: 48px;'))
  const parent = read('../views/knowledge/KnowledgeBase.vue')
  assert.ok(parent.includes(':collapsed="folderTreeCollapsed"'))
})

test('document grid uses the reference responsive 1/2/3/4-column contract', () => {
  const card = read('../views/knowledge/components/DocumentCardView.vue')
  const closure = read('./musuw-document-list-reference-final.css')
  for (const token of ['height: 192px', 'border-radius: 16px']) {
    assert.ok(card.includes(token), `DocumentCardView measured geometry drifted: ${token}`)
  }
  for (const token of [
    '.visual-document-grid,',
    'grid-template-columns: minmax(0, 1fr) !important',
    '@media (min-width: 640px)',
    'repeat(2, minmax(0, 1fr)) !important',
    '@media (min-width: 768px)',
    'repeat(3, minmax(0, 1fr)) !important',
    '@media (min-width: 1024px)',
    'repeat(4, minmax(0, 1fr)) !important',
  ]) assert.ok(closure.includes(token), `Document grid reference breakpoint drifted: ${token}`)
  assert.equal(closure.includes('repeat(auto-fill'), false)
})

test('knowledge skeleton shares the document-grid breakpoints and card geometry', () => {
  const closure = read('./musuw-document-list-reference-final.css')
  assert.ok(closure.includes('.visual-knowledge-skeleton-grid'))
  const source = read('../views/knowledge/KnowledgeBase.vue')
  for (const token of ['min-height: 192px', 'border-radius: 16px']) {
    assert.ok(source.includes(token), `knowledge skeleton geometry drifted: ${token}`)
  }
})

test('document list table uses the visual-source radius, columns and file-icon size', () => {
  const closure = read('./musuw-document-list-reference-final.css')
  for (const token of [
    'border-radius: 16px !important',
    '128px',
    '96px',
    '64px !important',
    'min-height: 56px !important',
    'flex: 0 0 32px !important',
    'width: 32px !important',
    'height: 32px !important',
  ]) assert.ok(closure.includes(token), `Document list geometry drifted: ${token}`)
})
