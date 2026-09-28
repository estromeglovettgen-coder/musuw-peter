import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('audited KnowledgeBase controller remains locked after upload progress and incremental refresh repair', () => {
  const controller = read('./business-baselines/KnowledgeBase.pre-view.vue')
  assert.equal(blobSha(controller), '77905990552ca5baa76310c0ea34c0c29df1d638')
})

test('rebuilt KnowledgeBase delegates setup to the frozen native controller and keeps Graph host binding intact', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  assert.match(source, /import LegacyKnowledgeBaseBusiness from .*KnowledgeBase\.pre-view\.vue/)
  assert.match(source, /const legacy = LegacyKnowledgeBaseBusiness as any/)
  assert.match(source, /const legacySetup = legacy\.setup/)
  assert.match(source, /const state = legacySetup\?\.\(props, context\)/)
  assert.doesNotMatch(source, /showFolderTree:\s*computed|currentChildFolders:\s*computed/)
  assert.match(source, /class="visual-knowledge-page"/)
  assert.ok(source.includes(`:view="activeKbTab === 'graph' ? 'graph' : 'browser'"`))
  assert.ok(source.includes('@open-source-doc="openSourceDoc"'))
  assert.ok(source.includes('@status-change="onWikiStatusChange"'))
  assert.ok(source.includes('@view-graph="onViewWikiInGraph"'))
})

test('rebuilt KnowledgeBase keeps every native top-level mode and remediation surface', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  for (const token of [
    'v-if="!isFAQ"',
    "activeKbTab === 'documents'",
    "activeKbTab === 'wiki'",
    "activeKbTab === 'graph'",
    'wikiIsIndexing',
    'unsupportedFileTypes.length',
    'goToParserSettings',
    'missingStorageEngine',
    'handleOpenKBSettings',
    'FAQEntryManager',
  ]) assert.ok(source.includes(token), `KnowledgeBase active View lost mode/remediation contract: ${token}`)
})

test('rebuilt documents View retains native filtering and document-operation surfaces except the user-hidden date UI', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  for (const token of [
    'docSearchKeyword',
    'tagFilterPanelVisible',
    'handleTagRowClick',
    'clearTagFilter',
    'openTagManageDrawer',
    'selectedFileType',
    'selectedParseStatus',
    "viewMode === 'grid'",
    "viewMode === 'list'",
    'KbUploadSourceDropdown',
    '@files="handleUploadSourceFiles"',
    '@url="handleUploadSourceUrl"',
    '@manual="handleManualCreate"',
    'DocumentCardView',
    'DocumentListView',
    'DocumentBatchBar',
    'TagEditDialog',
    'BatchTagDialog',
    'KbTagManageDrawer',
    'DocContent',
  ]) assert.ok(source.includes(token), `KnowledgeBase active View lost ${token}`)
  assert.equal(source.includes('updatedTimeRange'), false, 'date filter must stay hidden from the active consumer View')
  assert.equal(source.includes('selectedSource'), false, 'source filter must stay hidden from the active consumer View')
})

test('rebuilt documents View retains folder, collapsed rail, marquee, loading, empty and batch state machine surfaces', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  for (const token of [
    'v-if="showFolderTree"',
    ':collapsed="folderTreeCollapsed"',
    '@update:collapsed="handleFolderTreeCollapsedChange"',
    'folderBreadcrumbs',
    'handleFolderSelect',
    'handleFolderRename',
    'isFiltering',
    'docMarqueeVisible',
    'docMarqueeMode',
    'docMarqueeBoxStyle',
    '@mousedown="onDocMarqueeMouseDown"',
    '@scroll="handleScroll"',
    'docListLoading && cardList.length === 0 && !currentChildFolders.length',
    'currentChildFolders.length',
    'selectedFolderPath || isFiltering',
    'batchMode || selectedIds.size > 0',
    'confirmBatchDelete',
    'confirmBatchReparse',
    'handleBatchTag',
    'moveKnowledgeIntoFolder(Array.from(selectedIds), path)',
  ]) assert.ok(source.includes(token), `KnowledgeBase active View lost folder/selection state: ${token}`)
})

test('rebuilt document child components retain all native parent event bridges', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  for (const token of [
    '@toggle-checkbox=', 'onCardGridCheckboxChange',
    '@menu-visible-change=', 'onCardMoreVisibleChange',
    '@action=', 'handleCardAction',
    '@toggle-row=', 'toggleSelectRow',
    '@toggle-all=', 'toggleSelectAll', 'handleListAction',
    '@probe-trace=', 'probeTraceAvailable',
    '@move-select-target=', 'handleMoveSelectTarget',
    '@move-back="handleMoveBack"', '@move-confirm="handleMoveConfirm"',
    '@update:move-mode=', "moveMenuMode = 'normal'",
    '@closeDoc="closeDoc"', '@getDoc="getDoc"',
    '@summaryStateChange="syncDocumentSummaryState"',
  ]) assert.ok(source.includes(token), `KnowledgeBase lost parent/child event bridge: ${token}`)
})

test('rebuilt active KnowledgeBase does not expose the legacy documents shell', () => {
  const source = read('../views/knowledge/KnowledgeBase.vue')
  for (const token of ['class="knowledge-layout"', 'class="document-header"', 'class="doc-filter-bar"', 'class="doc-card-list"']) {
    assert.equal(source.includes(token), false, `KnowledgeBase still contains active legacy shell ${token}`)
  }
})
