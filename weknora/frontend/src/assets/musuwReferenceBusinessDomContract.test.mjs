import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('audited inline citation controller stays pinned to its reviewed business behavior', () => {
  // creator-marketplace-subscriptions: approved message-scoped snippets-only drawer and hover behavior.
  assert.equal(blobSha(read('../composables/useChatCitationPopover.ts')), '2c119360d4df7a48c25999306d1b863dc83fc231')
})

test('rebuilt answer reference summary preserves grouping, drawer handoff and KB navigation', () => {
  const source = read('../views/chat/components/docInfo.vue')
  for (const token of [
    "referencesDrawer.open({ references: refs, messageId: props.session?.id, marketplaceProductId: props.session?.marketplace_product_id })", "item.chunk_type === 'web_search'",
    'knowledgeId: item.knowledge_id', 'knowledgeBaseId: item.knowledge_base_id',
    'if (group.knowledgeId) query.knowledge_id = group.knowledgeId',
    'path: `/platform/knowledge-bases/${group.knowledgeBaseId}`', ':href="getDocumentHref(group)"',
  ]) assert.ok(source.includes(token), `docInfo lost ${token}`)
})

test('rebuilt citation hover and drawer retain citation states and navigation', () => {
  const float = read('../components/ChatCitationFloat.vue')
  for (const token of ["float.type === 'web'", ':href="float.url"', 'float.loading', 'float.error', 'float.content', 'class="visual-citation-float"', 'position: absolute']) {
    assert.ok(float.includes(token), `ChatCitationFloat lost ${token}`)
  }
  const drawer = read('../components/ChatReferencesDrawer.vue')
  for (const token of [
    'buildReferenceSections(references.value)', 'resolveReferenceHighlightKey(references.value, highlight.value)',
    'if (item.knowledgeId) query.knowledge_id = item.knowledgeId',
    'path: `/platform/knowledge-bases/${item.knowledgeBaseId}`', 'watch(highlight, () => { void scrollToHighlight() })',
    'class="visual-references-panel"',
  ]) assert.ok(drawer.includes(token), `ChatReferencesDrawer lost ${token}`)
})

test('rebuilt high-visibility Views own their active DOM directly', () => {
  const cases = [
    ['../components/menu.vue', 'class="visual-sidebar"', ['class="aside_box"', 'class="menu_top"', 'class="menu_bottom"']],
    ['../components/Input-field.vue', 'class="visual-chat-composer"', ['class="answers-input"', 'class="rich-input-container"', 'class="control-bar"', 'class="control-right"']],
    ['../views/chat/index.vue', 'class="visual-chat-view"', ['class="chat"', 'class="chat_scroll_box"', 'class="msg_list"', 'class="input-container"']],
    ['../views/knowledge/KnowledgeBase.vue', 'class="visual-knowledge-page"', ['class="knowledge-layout"', 'class="document-header"', 'class="doc-filter-bar"', 'class="doc-card-list"']],
    ['../views/knowledge/KnowledgeBaseList.vue', 'class="visual-kb-list"', ['class="kb-list-container"', 'class="kb-list-content"', 'class="kb-card-wrap"']],
  ]
  for (const [path, root, legacy] of cases) {
    const source = read(path)
    assert.ok(source.includes(root), `${path} lost ${root}`)
    for (const token of legacy) assert.equal(source.includes(token), false, `${path} still exposes ${token}`)
  }
})

test('manual knowledge editor composes the existing native SettingDrawer', () => {
  const source = read('../components/manual-knowledge-editor.vue')
  for (const token of ['<SettingDrawer', 'class="manual-editor"', 'class="setting-drawer__section"']) {
    assert.ok(source.includes(token), `manual editor lost ${token}`)
  }
  assert.equal(source.includes('visual-manual-editor__overlay'), false)
})

test('active KnowledgeBase keeps Graph as an untouched WikiBrowser-hosted business surface', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  assert.ok(source.includes(`:view="activeKbTab === 'graph' ? 'graph' : 'browser'"`))
  assert.ok(source.includes('@open-source-doc="openSourceDoc"'))
  assert.ok(source.includes('@status-change="onWikiStatusChange"'))
  assert.ok(source.includes('@view-graph="onViewWikiInGraph"'))
})
