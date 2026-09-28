import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('frozen KnowledgeBaseList controller remains the original implementation', () => {
  assert.equal(
    blobSha(read('./business-baselines/KnowledgeBaseList.pre-view.vue')),
    'c49c30b1e68b3e99b8965b447eadac4bfc268249',
  )
})

test('rebuilt KnowledgeBaseList reuses normalized frozen setup', () => {
  const source = read('../views/knowledge/KnowledgeBaseList.vue')
  assert.match(source, /import LegacyKnowledgeBaseListBusiness from .*KnowledgeBaseList\.pre-view\.vue/)
  assert.match(source, /const legacySetup = legacy\.setup/)
  // The plain object preserves every frozen setup binding while allowing
  // presentation-only state such as the subscribed-library count.
  assert.match(source, /return\s*\{\s*\.\.\.state\s*(?:,|\})/)
  assert.match(source, /return\s*\{\s*\.\.\.state\s*,[^}]*\bmarketLibraryCount\b/)
  assert.match(source, /class="visual-kb-list"/)
  for (const token of [
    'class="kb-list-container"',
    'class="kb-list-content"',
    'class="kb-card-wrap"',
    'class="kb-card"',
    'class="card-header"',
  ]) assert.equal(source.includes(token), false, `KnowledgeBaseList still exposes legacy shell ${token}`)
})

test('rebuilt list retains every native scope and sharing group surface', () => {
  const source = read('../views/knowledge/KnowledgeBaseList.vue')
  for (const token of [
    "spaceSelection === 'all'",
    "spaceSelection === 'favorites'",
    "spaceSelection === 'recents'",
    "spaceSelection === 'mine'",
    'spaceSelectionOrgId',
    'filteredKnowledgeBases.length > 0',
    'sortedMineKbs.length > 0',
    'sortedSpaceKbsList.length > 0',
    "toggleKbSection('pinned')",
    "toggleKbSection('tenantOthers')",
    "toggleKbSection('sharedByMe')",
    "toggleKbSection('sharedEditable')",
    "toggleKbSection('sharedReadonly')",
    'isKbSectionCollapsed(kbSectionOf(kb))',
    'isSpaceKbCollapsed(shared)',
    'handleSharedKbClickFromAll(kb)',
    'openSharedDetailFromAll(kb)',
    'handleSharedKbClick(shared)',
    'openSharedDetail(shared)',
    'knowledgeList.empty.favoritesTitle',
    'knowledgeList.empty.recentsTitle',
    'knowledgeList.empty.sharedTitle',
  ]) assert.ok(source.includes(token), `KnowledgeBaseList active View lost scope contract: ${token}`)
})

test('rebuilt list retains native upload, pin, favorite, duplicate, delete, create and origin states', () => {
  const source = read('../views/knowledge/KnowledgeBaseList.vue')
  const card = read('../views/knowledge/components/KnowledgeBaseListReferenceCard.vue')
  for (const token of [
    'uploadSummaries.length',
    'summary.completed === summary.total',
    'summary.hasError',
    'isKbFavorited(kb.id)',
    'toggleFavoriteKb(kb.id, $event)',
    'handleTogglePinById(kb.id)',
    'handleTogglePin(kb)',
    'canDuplicateKBCard(kb)',
    'handleDuplicateById(kb.id)',
    'handleDuplicate(kb)',
    'canManageKBCard(kb)',
    'handleDeleteById(kb.id)',
    'handleDelete(kb)',
    'handleCreateKnowledgeBase',
    'kb.isProcessing',
    'kb.question_generation_config?.enabled',
    '(kb.share_count ?? 0) > 0',
    'showKbOriginBadge(kb)',
    'ResourceOriginBadge',
    'KnowledgeBaseEditorModal',
    'ShareKnowledgeBaseDialog',
    'sharedDetailPanelVisible',
  ]) assert.ok(source.includes(token) || card.includes(token), `KnowledgeBaseList active View lost ${token}`)
})
