import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('frozen manual editor controller remains the original implementation', () => {
  assert.equal(
    blobSha(read('./business-baselines/manual-knowledge-editor.pre-view.vue')),
    '4b6090b0ee24ffbcc97ccdd3f70220cd44966a8e',
  )
})

test('manual editor reuses the frozen controller inside the native SettingDrawer shell', () => {
  const source = read('../components/manual-knowledge-editor.vue')
  assert.match(source, /import LegacyManualEditorBusiness from .*manual-knowledge-editor\.pre-view\.vue/)
  assert.match(source, /import SettingDrawer from .*SettingDrawer\.vue/)
  assert.match(source, /const legacySetup = legacy\.setup/)
  assert.match(source, /return \{ \.\.\.state \}/, 'the wrapper must remove the virtual controller __isScriptSetup marker')
  assert.doesNotMatch(source, /adapterState|setup:\s*legacy\.setup/)
  assert.match(source, /components:\s*\{[\s\S]*?SettingDrawer/)
  for (const token of ['<SettingDrawer', 'class="manual-editor"', 'class="setting-drawer__section"']) {
    assert.ok(source.includes(token), `manual editor lost native drawer token: ${token}`)
  }
  assert.doesNotMatch(source, /visual-manual-editor__overlay/)
})

test('rebuilt manual editor keeps edit preview markdown status and save workflows visible', () => {
  const source = read('../components/manual-knowledge-editor.vue')
  for (const token of [
    'form.title',
    'form.kbId',
    'form.status',
    'toolbarGroups',
    'Number(groupIndex) < toolbarGroups.length - 1',
    'handleToolbarAction(btn.action)',
    "activeTab === 'edit'",
    "activeTab === 'preview'",
    'previewHTML',
    "handleSave('draft')",
    "handleSave('publish')",
    'savingAction',
    'lastUpdatedText',
  ]) assert.ok(source.includes(token), `manual editor active View lost ${token}`)
})

test('manual editor delegates persistent resizing to SettingDrawer', () => {
  const source = read('../components/manual-knowledge-editor.vue')
  for (const token of [
    'width="760px"',
    ':min-width="560"',
    ':max-width="1280"',
    'storage-key="setting-drawer:width:manual-markdown-editor"',
  ]) assert.ok(source.includes(token), `manual editor lost resize contract: ${token}`)
  for (const customState of ['onResizeStart', 'onResizeMove', 'onResizeEnd', 'window.localStorage.setItem']) {
    assert.equal(source.includes(customState), false, `manual editor still owns drawer state: ${customState}`)
  }
})

test('manual editor consumes the shared dark card surfaces without repainting other drawers', () => {
  const source = read('../components/manual-knowledge-editor.vue')
  assert.match(source, /class="manual-editor-drawer"/)
  assert.match(
    source,
    /:root\[theme-mode="dark"\] body \.t-drawer\.manual-editor-drawer > \.t-drawer__content-wrapper[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/,
  )
  assert.match(
    source,
    /:root\[theme-mode="dark"\] body \.manual-editor-drawer \.t-input,[\s\S]*?\.manual-editor-drawer \.t-textarea__inner[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/,
  )
  assert.match(
    source,
    /:root\[theme-mode="dark"\] body \.manual-editor-drawer \.t-drawer__footer[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/,
  )
})
