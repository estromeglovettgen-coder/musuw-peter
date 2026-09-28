import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const list = readFileSync(new URL('./KnowledgeBaseList.vue', import.meta.url), 'utf8')
const detail = readFileSync(new URL('./KnowledgeBase.vue', import.meta.url), 'utf8')

test('Lite hides historical FAQ cards and the direct FAQ manager while Standard keeps them', () => {
  assert.match(list, /return\s*\{\s*\.\.\.state\s*(?:,|\})/)
  assert.match(list, /v-if="!authStore\.isLiteMode \|\| kb\.type !== 'faq'"/)
  assert.match(list, /v-if="!authStore\.isLiteMode \|\| shared\.knowledge_base\?\.type !== 'faq'"/)
  assert.match(list, /!filteredKnowledgeBases\.some\([\s\S]{0,100}!authStore\.isLiteMode \|\| kb\.type !== 'faq'/)
  assert.match(detail, /v-else-if="!authStore\.isLiteMode"[^>]*><FAQEntryManager/)
})
