import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./KBAdvancedSettings.vue', import.meta.url), 'utf8')
const template = source.slice(0, source.indexOf('<script setup'))

test('Lite advanced settings expose only automatic tags and hide every model control', () => {
  assert.match(source, /consumerMode\?: boolean/)
  assert.match(template, /v-if="!consumerMode && ragEnabled !== false"/)
  assert.match(template, /v-if="!consumerMode && localAutoTag\.enabled"/)
  assert.doesNotMatch(template, /v-if="consumerMode[\s\S]*?<ModelSelector/)
  const autoDetailsStart = template.indexOf('<div v-if="!consumerMode && localAutoTag.enabled"')
  const autoDetailsEnd = template.indexOf('<div v-if="!consumerMode" class="setting-row setting-row-vertical">')
  assert.ok(autoDetailsStart >= 0 && autoDetailsEnd > autoDetailsStart)
  assert.match(template.slice(autoDetailsStart, autoDetailsEnd), /<ModelSelector/)
  assert.match(template, /v-model="localAutoTag\.enabled"/)
  assert.match(template, /v-if="!consumerMode"[\s\S]*?tableMetadataInstructions/)
})

test('Lite automatic tags keep managed V4 Flash, three matches, and manual tags', () => {
  assert.match(source, /LITE_AUTO_TAG_MODEL_ID\s*=\s*'builtin-deepseek-v4-flash'/)
  assert.match(source, /modelId:\s*props\.consumerMode\s*\?\s*LITE_AUTO_TAG_MODEL_ID/)
  assert.match(source, /maxTags:\s*props\.consumerMode\s*\?\s*3/)
  assert.match(source, /skipIfTagged:\s*props\.consumerMode\s*\?\s*true/)
  assert.match(source, /if \(props\.consumerMode\)[\s\S]*?normalizeAutoTag\(localAutoTag\.value\)/)
})
