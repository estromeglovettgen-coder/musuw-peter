import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./MemorySettings.vue', import.meta.url), 'utf8')
const template = source.slice(0, source.indexOf('<script setup'))
const script = source.slice(source.indexOf('<script setup'), source.indexOf('<style'))

test('personal memory follows the shared Musuw settings rhythm', () => {
  assert.match(template, /class="visual-settings-page-header"/)
  assert.match(template, /class="visual-settings-page-header__copy"/)
  assert.match(template, /class="visual-settings-page-header__title"/)
  assert.match(template, /class="visual-settings-page-header__description"/)
  assert.match(template, /class="setting-row"/)
  const style = source.slice(source.indexOf('<style'))
  assert.doesNotMatch(style, /padding:\s*20px\s+0/)
  assert.doesNotMatch(style, /font-size:\s*20px/)
  assert.doesNotMatch(style, /font-size:\s*15px/)
})

test('one click starts one visible memory create request', () => {
  assert.match(
    template,
    /theme="primary"[^>]*:loading="creating"[^>]*@click="handleCreate"/,
    'the first click must immediately show that the memory is being saved',
  )
  assert.match(
    template,
    /<t-button size="small" variant="text" :disabled="!canWrite \|\| creating">[\s\S]*?memorySettings\.add/,
    'a dismissed popup cannot start a newer draft while the earlier save is still finishing',
  )
  assert.match(template, /v-model="draftKind"[\s\S]*?:disabled="creating"/)
  assert.match(template, /v-model="draftContent"[\s\S]*?:disabled="creating"/)

  const createBody = script.match(/const handleCreate = async \(\) => \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(createBody, /if \(creating\.value\) return/)
  assert.match(createBody, /creating\.value = true/)
  assert.match(createBody, /finally \{\s*creating\.value = false\s*\}/)
})

test('a late create response cannot clear or close a newer memory draft', () => {
  const createBody = script.match(/const handleCreate = async \(\) => \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(createBody, /const draftVersion = addDraftVersion\.value/)
  assert.match(createBody, /const kind = draftKind\.value/)
  assert.match(
    createBody,
    /const ownsSubmittedDraft =\s*draftVersion === addDraftVersion\.value &&\s*draftContent\.value\.trim\(\) === content &&\s*draftKind\.value === kind/,
    'only the popup session that submitted the request may be reset when it completes',
  )
  assert.match(
    createBody,
    /if \(ownsSubmittedDraft\) \{[\s\S]*?draftContent\.value = ''[\s\S]*?addVisible\.value = false[\s\S]*?tab\.value = 'active'[\s\S]*?MessagePlugin\.success/,
    'a stale completion must not close the popup, switch tabs, or announce success for a newer draft',
  )
  assert.match(
    createBody,
    /catch \(error: any\) \{\s*if \(draftVersion === addDraftVersion\.value && draftContent\.value\.trim\(\) === content && draftKind\.value === kind\) \{\s*MessagePlugin\.error/,
    'a stale failure must not be presented as a failure of the newer draft',
  )
  assert.match(
    script,
    /watch\(addVisible, \(visible\) => \{\s*if \(visible\) \{\s*addDraftVersion\.value \+= 1/,
    'opening a new popup must identify a new draft session',
  )
})
