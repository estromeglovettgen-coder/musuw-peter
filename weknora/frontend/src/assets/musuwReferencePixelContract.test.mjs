import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const main = read('../main.ts')
const visual = read('./musuw-visual.less')
const primitives = read('./musuw-ui-primitives.css')

const migratedViewFiles = [
  '../views/creatChat/creatChat.vue',
  '../views/chat/index.vue',
  '../components/menu.vue',
  '../components/Input-field.vue',
  '../components/UserMenu.vue',
  '../components/SessionSidebarRow.vue',
  '../components/SessionSourceFilter.vue',
  '../components/ModelSelector.vue',
  '../components/ModelDebugDrawer.vue',
  '../components/AttachmentUpload.vue',
  '../components/KnowledgeBaseSelector.vue',
  '../components/KBSwitcherDropdown.vue',
  '../components/MentionSelector.vue',
  '../components/ChatAttachmentPreviewDrawer.vue',
  '../components/ChatHeader.vue',
  '../components/ChatRequestInfoButton.vue',
  '../components/ChatCitationFloat.vue',
  '../components/ChatReferencesDrawer.vue',
  '../views/chat/components/usermsg.vue',
  '../views/chat/components/botmsg.vue',
  '../views/chat/components/docInfo.vue',
  '../views/chat/components/deepThink.vue',
  '../views/chat/components/RagPipelineProgress.vue',
  '../views/knowledge/KnowledgeBase.vue',
  '../views/knowledge/KnowledgeBaseList.vue',
  '../views/knowledge/components/DocumentCardView.vue',
  '../views/knowledge/components/DocumentListView.vue',
  '../views/knowledge/components/DocumentActionMenu.vue',
  '../views/knowledge/components/DocumentBatchBar.vue',
  '../views/knowledge/components/KbFolderTree.vue',
  '../views/knowledge/components/FolderPickerMenu.vue',
  '../views/knowledge/components/KbUploadSourceDropdown.vue',
  '../views/knowledge/components/TagEditDialog.vue',
  '../views/knowledge/components/BatchTagDialog.vue',
  '../views/knowledge/components/KbTagManageDrawer.vue',
  '../views/settings/GeneralSettings.vue',
  '../views/settings/ModelSettings.vue',
]

test('one presentation seam owns the active visual layer order', () => {
  assert.ok(main.includes('import "@/assets/musuw-visual.less"'))
  for (const legacy of [
    'musuw-reference-mechanical.css',
    'musuw-reference-citation-sources.css',
    'musuw-reference-core.less',
    'musuw-reference-workbench.less',
    'musuw-reference-header.less',
    'musuw-reference-knowledge-v2.less',
    'musuw-reference-knowledge-v3.less',
    'musuw-reference-knowledge-v4.less',
    'musuw-reference-dom-bridge.css',
  ]) assert.equal(main.includes(legacy), false, `${legacy} must not be imported by main.ts`)

  assert.equal(main.includes('musuw-ui-primitives.css'), false)
  assert.ok(visual.includes('"./musuw-ui-primitives.css"'))
})

test('migrated views own their own visual-prefixed geometry', () => {
  for (const path of migratedViewFiles) {
    const source = read(path)
    assert.match(source, /class="(?:[^"\n]*\s)?visual-[^"\n]+"/, `${path} has no direct visual root`)
    assert.match(source, /<style/, `${path} has no direct view stylesheet`)
  }
})

test('settings delegates its shell geometry to the shared visual settings shell', () => {
  const settings = read('../views/settings/Settings.vue')
  const shell = read('../views/settings/components/VisualSettingsShell.vue')

  assert.match(settings, /<VisualSettingsShell/)
  assert.doesNotMatch(settings, /<style/)
  assert.match(shell, /class="visual-settings-overlay"/)
  assert.match(shell, /class="visual-settings-modal"/)
  assert.match(shell, /<style/)
})

test('manual editor delegates its shell geometry to SettingDrawer', () => {
  const source = read('../components/manual-knowledge-editor.vue')
  assert.match(source, /<SettingDrawer/)
  assert.match(source, /class="manual-editor"/)
  assert.doesNotMatch(source, /visual-manual-editor__overlay/)
})

test('shared primitive layer is scoped only to rebuilt visual surfaces', () => {
  for (const token of ['--font-sans', '--font-mono', '[class^="visual-"]', 'scrollbar-width']) {
    assert.ok(primitives.includes(token), `primitive layer lost ${token}`)
  }
  for (const forbidden of [
    'html,\nbody', '#app', '* {', '.t-popup', '.t-dialog', '.aside_box', '.answers-input',
    '.rich-input-container', '.chat_scroll_box', '.kb-list-container', '.knowledge-layout',
    '.settings-overlay', '.manual-editor', '.bot_msg', '.refer', '.wiki-graph',
  ]) assert.equal(primitives.includes(forbidden), false, `primitive layer leaks outside rebuilt Views: ${forbidden}`)
})
