import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

// The visual reference is intentionally incomplete: it defines the visual language,
// not the product state machine. Migrated views must render native business states
// in that visual language instead of deleting states that the reference did not draw.
test('document grid keeps the complete native processing-state presentation', () => {
  const source = read('../views/knowledge/components/DocumentCardView.vue')
  for (const token of [
    "new Set(['pending', 'processing', 'finalizing'])",
    "item.parse_status === 'finalizing'",
    "item.summary_status === 'pending' || item.summary_status === 'processing'",
    "t('knowledgeBase.generatingSummary')",
    "t('knowledgeBase.statusFinalizing')",
    "t('knowledgeBase.parsingInProgress')",
    "item.parse_status === 'failed'",
    "item.parse_status === 'draft'",
    "item.parse_status === 'completed'",
  ]) {
    assert.ok(source.includes(token), `document grid lost business state: ${token}`)
  }
})

test('failed documents surface the backend public reason instead of hiding every failure behind a generic label', () => {
  const card = read('../views/knowledge/components/DocumentCardView.vue')
  const list = read('../views/knowledge/components/DocumentListView.vue')
  const knowledgeBase = read('./business-baselines/KnowledgeBase.pre-view.vue')

  assert.match(card, /item\.error_message\s*\|\|\s*\$t\('knowledgeBase\.parsingFailed'\)/)
  assert.match(list, /item\.error_message\s*\|\|\s*t\('knowledgeBase\.statusFailed'\)/)
  assert.match(knowledgeBase, /card\.error_message\s*=\s*item\.error_message/)
})

test('document grid keeps native tag overflow behavior rather than flattening the reference mock', () => {
  const source = read('../views/knowledge/components/DocumentCardView.vue')
  for (const token of [
    "useTagChipsOverflow('tagItemId')",
    'setupTagChipsObserver',
    'getTagLimit',
    'hasTagOverflow',
    'getOverflowCount',
    '.slice(0, getTagLimit(item.id))',
    '+{{ getOverflowCount(item.id, (item.tags || []).length) }}',
  ]) {
    assert.ok(source.includes(token), `document grid lost tag overflow contract: ${token}`)
  }
})

test('document list keeps the same complete state and tag-overflow semantics', () => {
  const source = read('../views/knowledge/components/DocumentListView.vue')
  for (const token of [
    "item.parse_status === 'pending' || item.parse_status === 'processing'",
    "item.parse_status === 'finalizing'",
    "item.parse_status === 'failed'",
    "item.parse_status === 'cancelled'",
    "item.parse_status === 'draft'",
    "item.parse_status === 'completed'",
    "useTagChipsOverflow('listTagItemId')",
    'getTagLimit',
    'getOverflowCount',
  ]) {
    assert.ok(source.includes(token), `document list lost business presentation contract: ${token}`)
  }
})

test('tag overflow utility keeps at least one visible tag and reports the remainder', () => {
  const source = read('../composables/useTagChipsOverflow.ts')
  assert.ok(source.includes('Math.max(1, Math.min(maxFit, total))'))
  assert.ok(source.includes('return Math.max(0, total - getTagLimit(itemId))'))
})
