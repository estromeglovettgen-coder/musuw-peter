import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./MemorySettings.vue', import.meta.url), 'utf8')
const template = source.slice(0, source.indexOf('<script setup'))
const styles = source.slice(source.indexOf('<style'))

test('memory kind selector opts into the shared scene-model trigger surface', () => {
  assert.match(
    template,
    /<t-select\s+class="visual-scene-select"[\s\S]*?v-model="draftKind"/,
    'the Lite-visible memory type selector must use the shared scene-model dropdown trigger',
  )
})

test('memory kind selector does not add a second popup chrome layer', () => {
  assert.doesNotMatch(template, /memory-add-kind-popup/)
  assert.doesNotMatch(styles, /memory-add-kind-popup/)
})
