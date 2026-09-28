import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const component = readFileSync(new URL('./TagEditDialog.vue', import.meta.url), 'utf8')
const zhCN = readFileSync(new URL('../../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
const enUS = readFileSync(new URL('../../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
const koKR = readFileSync(new URL('../../../i18n/locales/ko-KR.ts', import.meta.url), 'utf8')
const ruRU = readFileSync(new URL('../../../i18n/locales/ru-RU.ts', import.meta.url), 'utf8')

test('tag edit view is rebuilt on the visual shell', () => {
  assert.match(component, /class="visual-tag-edit"/)
  assert.match(component, /class="visual-tag-edit__overlay"/)
  assert.doesNotMatch(component, /dialog-class-name="tag-edit-dialog"/)
  assert.doesNotMatch(component, /class="setting-drawer__section"/)
})

test('tag edit preserves native selected available create and manage behavior', () => {
  for (const token of [
    'selectedSet.value = new Set(props.selectedTags.map((t) => t.id))',
    'selectedTagsList',
    'availableTagsList',
    'function toggleTag(tagId: string)',
    'function clearAll()',
    'await createKnowledgeBaseTag(props.kbId, { name })',
    "emit('tag-created')",
    "emit('confirm', Array.from(selectedSet.value))",
    "emit('update:visible', false)",
    "emit('open-manage')",
  ]) {
    assert.ok(component.includes(token), `tag edit lost behavior contract: ${token}`)
  }
})

test('defines tag edit copy in every supported locale', () => {
  for (const locale of [zhCN, enUS, koKR, ruRU]) {
    assert.match(locale, /tagEditDialogHeading:/)
    assert.match(locale, /tagEditSelectedSection:/)
    assert.match(locale, /tagEditAvailableSection:/)
  }
})
