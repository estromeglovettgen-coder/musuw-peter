import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'docInfo.vue'), 'utf8')

test('timeline references neutralize brand colors via local css variables', () => {
  assert.match(source, /\.visual-answer-references\.is-timeline \{[\s\S]*background: transparent/)
  assert.match(source, /\.visual-answer-references\.is-timeline \.visual-answer-references__header \{[^}]*color: #6b7280/)
  assert.match(source, /\.visual-answer-reference-chunk:hover \{[^}]*background: #f3f4f6; color: #374151/)
})

test('doc header uses right/down chevron on the outer title only', () => {
  assert.match(source, /showReferBox \? 'chevron-down' : 'chevron-right'/)
  assert.doesNotMatch(source, /class="doc-group-arrow"/)
})
