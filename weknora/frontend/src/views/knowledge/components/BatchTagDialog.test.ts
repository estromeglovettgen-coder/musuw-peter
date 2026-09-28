import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const component = readFileSync(new URL('./BatchTagDialog.vue', import.meta.url), 'utf8')
const zhCN = readFileSync(new URL('../../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
const enUS = readFileSync(new URL('../../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
const koKR = readFileSync(new URL('../../../i18n/locales/ko-KR.ts', import.meta.url), 'utf8')
const ruRU = readFileSync(new URL('../../../i18n/locales/ru-RU.ts', import.meta.url), 'utf8')

test('batch tag dialog is rebuilt on the visual shell', () => {
  assert.match(component, /class="visual-batch-tag"/)
  assert.match(component, /class="visual-batch-tag__overlay"/)
  assert.doesNotMatch(component, /dialog-class-name="batch-tag-dialog"/)
  assert.doesNotMatch(component, /class="setting-drawer__section"/)
})

test('batch tag preserves preselection creation confirmation loading and manage handoff', () => {
  for (const token of [
    'selectedSet.value = new Set(props.preSelectedTagIds ?? [])',
    'function toggleTag(tagId: string)',
    'function clearAll()',
    'await createKnowledgeBaseTag(props.kbId, { name })',
    "emit('tag-created')",
    'if (props.confirmLoading) return',
    "emit('confirm', Array.from(selectedSet.value))",
    "emit('update:visible', false)",
    "emit('open-manage')",
  ]) {
    assert.ok(component.includes(token), `batch tag lost behavior contract: ${token}`)
  }
})

test('defines batch tag strings in every supported locale', () => {
  for (const locale of [zhCN, enUS, koKR, ruRU]) {
    assert.match(locale, /batchTagDialogHeading:/)
    assert.match(locale, /batchTagSelectedSection:/)
    assert.match(locale, /batchTagAvailableSection:/)
    assert.match(locale, /batchTagSuccess:/)
    assert.match(locale, /batchTagFailed:/)
  }
})
