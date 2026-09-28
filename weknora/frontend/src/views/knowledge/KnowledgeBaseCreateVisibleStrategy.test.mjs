import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editor = readFileSync(new URL('./KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
const card = readFileSync(new URL('./components/KnowledgeBaseListReferenceCard.vue', import.meta.url), 'utf8')
const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')

test('Lite cannot submit a document library without visible RAG or Wiki indexing', () => {
  assert.match(
    editor,
    /:disabled="saving \|\| \(authStore\.isLiteMode && !isFAQ && !formData\.indexingStrategy\.vectorEnabled && !formData\.indexingStrategy\.keywordEnabled && !formData\.indexingStrategy\.wikiEnabled\)"/,
  )
  assert.match(
    editor,
    /if \(authStore\.isLiteMode && normalizeKnowledgeBaseType\(formData\.value\.type\) === 'document'\) \{[\s\S]*?knowledgeEditor\.indexing\.atLeastOne[\s\S]*?if \(authStore\.isLiteMode\) return true/,
  )
})

test('copy wording states the native asynchronous content-copy contract', () => {
  assert.match(zh, /duplicate: '复制知识库'/)
  assert.match(zh, /duplicateStarted: '正在后台复制知识库配置、文档与索引'/)
  assert.match(zh, /duplicateSuccess: '知识库复制完成'/)
  assert.match(en, /duplicate: 'Copy knowledge base'/)
  assert.match(en, /duplicateStarted: 'Copying knowledge base settings, documents, and indexes in the background'/)
  assert.match(en, /duplicateSuccess: 'Knowledge base copy completed'/)
})

test('knowledge-base cards identify RAG and legacy unconfigured Lite rows', () => {
  assert.match(card, /data-indexing-strategy="rag"/)
  assert.match(card, /data-indexing-strategy="unconfigured"/)
  assert.match(card, /authStore\.isLiteMode/)
})
