import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const knowledgeBase = read('./KnowledgeBase.vue')
const finalTheme = read('../../assets/musuw-final-theme-closure.css')

test('document filters share the All Tags trigger and avoid native select markup', () => {
  const triggerCount = (knowledgeBase.match(/class="visual-knowledge-filter-button"/g) || []).length
  assert.equal(triggerCount, 3, 'tag, type and status must use the same visual trigger')

  const filtersStart = knowledgeBase.indexOf('<div class="visual-knowledge-filters">')
  const filtersEnd = knowledgeBase.indexOf('</div>\n            </div>\n\n            <div class="visual-knowledge-toolbar__right">', filtersStart)
  assert.ok(filtersStart >= 0 && filtersEnd > filtersStart, 'document filter region must remain present')
  const filters = knowledgeBase.slice(filtersStart, filtersEnd)
  assert.doesNotMatch(filters, /<t-select\b/, 'document filters must use the shared popup trigger')
  assert.match(filters, /fileTypeOptions[\s\S]*visual-knowledge-filter-button/)
  assert.match(filters, /parseStatusOptions[\s\S]*visual-knowledge-filter-button/)
  assert.match(
    filters,
    /:title="activeTagFilterTitle"[^>]*@mouseenter="tagFilterTriggerHover = true"[^>]*@mouseleave="tagFilterTriggerHover = false"/,
    'the All Tags trigger must retain its hover-to-clear interaction',
  )
})

test('all document filter triggers stay white in light mode and never ellipsize labels', () => {
  const activeTriggerBlock = knowledgeBase.match(/\.visual-knowledge-filter-button\.is-active\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(
    activeTriggerBlock,
    /background:\s*#fff\s*!?;/,
    'active light trigger should remain white like the inactive trigger',
  )
  assert.match(
    knowledgeBase,
    /\.visual-knowledge-filter-button > span:not\(\.visual-knowledge-filter-button__clear\)\s*\{[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*nowrap;/,
  )
  assert.doesNotMatch(
    knowledgeBase,
    /\.visual-knowledge-filter-button > span:not\(\.visual-knowledge-filter-button__clear\)\s*\{[^}]*text-overflow:\s*ellipsis;/,
  )
})

test('dark theme keeps the shared trigger on semantic surfaces', () => {
  assert.match(
    finalTheme,
    /\.visual-knowledge-filter-button\.is-active\s*\{[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/,
  )
})
