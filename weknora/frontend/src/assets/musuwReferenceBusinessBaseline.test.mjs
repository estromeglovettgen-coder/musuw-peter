import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
const scriptOf = (path) => read(path).match(/<script setup(?: lang="ts")?>([\s\S]*?)<\/script>/)?.[1] || ''

// creator-marketplace-subscriptions: consumer agent models/readiness follow the buyer membership catalog; source defaults cannot override explicit selection.
const frozen = new Map([
  ['./business-baselines/Input-field.pre-view.vue', 'c384320815e08b7305ef7395fb94c11205c76388'],
  ['./business-baselines/KnowledgeBase.pre-view.vue', '77905990552ca5baa76310c0ea34c0c29df1d638'],
  ['./business-baselines/manual-knowledge-editor.pre-view.vue', '4b6090b0ee24ffbcc97ccdd3f70220cd44966a8e'],
  // creator-marketplace-subscriptions: approved message-scoped snippets-only drawer and hover behavior.
  ['../composables/useChatCitationPopover.ts', '2c119360d4df7a48c25999306d1b863dc83fc231'],
  ['../views/knowledge/components/KbWikiBadge.vue', '51550c1c65be38b9f47a4e9e38c49a482f449d5c'],
  ['../views/knowledge/wiki/WikiFolderActions.vue', 'f461dacf3a42a51afee8535a1ceea90e350a84c2'],
  ['../views/knowledge/wiki/WikiRevisionDrawer.vue', 'ad87842ea929a642f6001bcf5c97ced49ab17cf5'],
  ['../components/settings/SettingDrawer.vue', '9ce6d22d9a2420f734f6d20c5029d882c1218b82'],
])

test('protected controllers, compatibility bridges and excluded Graph/Wiki implementations stay byte-for-byte frozen', () => {
  for (const [path, sha] of frozen) {
    assert.equal(blobSha(read(path)), sha, `${path} changed outside its allowed migration boundary`)
  }
})

test('citation hover bridge follows the rebuilt float class without restoring legacy float styling', () => {
  const citation = read('../composables/useChatCitationPopover.ts')
  const floatView = read('../components/ChatCitationFloat.vue')
  assert.ok(citation.includes("document.querySelector('.visual-citation-float:hover')"))
  assert.ok(citation.includes("closest?.('.citation-kb, .citation-web, .visual-citation-float')"))
  assert.ok(floatView.includes('class="visual-citation-float"'))
  assert.equal(floatView.includes('class="chat-citation-float"'), false)
})

const directScriptContracts = new Map([
  ['../views/creatChat/creatChat.vue', [
    'getSuggestedQuestions(agentId, settingsStore.getSuggestedQuestionsParams())',
    'inputFieldRef.value?.triggerSend(question)',
    'const res = await createSessions(sessionData)',
    'usemenuStore.changeFirstQuery(value, mentionedItems, modelId, imageFiles, attachmentFiles, thinking, reasoningEffort)',
    'router.push(`/platform/chat/${sessionId}`)',
  ]],
  ['../views/knowledge/components/DocumentCardView.vue', [
    "emit('open', item)",
    "emit('toggle-checkbox', item.id, !props.selectedIds.has(item.id))",
    "emit('move-to-folder', item, path)",
    "emit('action', action, item)",
  ]],
  ['../views/knowledge/components/DocumentListView.vue', [
    "emit('toggle-all', checked)",
    "emit('toggle-row', item.id, checked, !!me?.shiftKey)",
    "if (it) emit('probe-trace', it)",
    "emit('move-to-folder', item, path)",
  ]],
  ['../views/knowledge/components/KbTagManageDrawer.vue', [
    'await listKnowledgeTags(props.kbId',
    'await createKnowledgeBaseTag(props.kbId, { name })',
    'await updateKnowledgeBaseTag(props.kbId, editingTagId.value, { name })',
    'await deleteKnowledgeBaseTag(props.kbId, tag.seq_id, { force: true })',
    'setTimeout(resolve, 800)',
  ]],
  ['../views/settings/Settings.vue', [
    "route.path === '/platform/settings' || uiStore.showSettingsModal",
    'uiStore.closeSettings()',
    'router.back()',
    'INTEGRATION_TAB_MIN_ROLE',
    'SYSTEM_ADMIN_SETTINGS_SECTIONS',
  ]],
  ['../views/settings/GeneralSettings.vue', [
    "savedLocale = localStorage.getItem('locale')",
    'const persisted = persistLocalePreference(localLanguage.value)',
    'if (!setTheme(value))',
    'if (!setSansFont(value))',
    'if (!setMonoFont(value))',
    'if (!setFontSize(value))',
  ]],
  ['../views/settings/ModelSettings.vue', [
    'const models = await listModels()',
    "model.isBuiltin ? authStore.isSystemAdmin : authStore.hasRole('admin')",
    'await updateModelAPI(editingModel.value.id, apiModelData)',
    'await createModel(apiModelData)',
    'await deleteModelAPI(modelId)',
  ]],
])

test('direct script-setup views retain their load-bearing native business contracts', () => {
  for (const [path, tokens] of directScriptContracts) {
    const script = scriptOf(path)
    assert.ok(script, `${path} expected a direct <script setup> business surface`)
    for (const token of tokens) assert.ok(script.includes(token), `${path} lost business contract: ${token}`)
  }
})

test('sidebar adapter consumes the frozen business controller instead of duplicating or replacing it', () => {
  const active = read('../components/menu.vue')
  const business = scriptOf('./business-baselines/menu.pre-view.vue')
  assert.ok(active.includes("LegacySidebarBusiness from '@/assets/business-baselines/menu.pre-view.vue'"))
  assert.ok(active.includes('const state = legacySetup?.(props, context)'))
  for (const token of [
    'buildBucketDefinitions(',
    'mergeBucketPage(',
    'ensureBucketFillsViewport',
    'await batchDelSessions(selectedIds)',
    'await renameSession(item.id, title, item.description || "")',
    'setSessionPinned(item.id, pin)',
    'clearSession(item.id)',
    'removeSession(item.id)',
    'window.addEventListener(SESSION_MUTATION_EVENT, handleSessionMutation)',
    'handoffToExternalAuth("logout")',
  ]) {
    assert.ok(business.includes(token), `frozen sidebar controller lost business contract: ${token}`)
  }
  for (const binding of [
    'handleMenuClick', 'commandPaletteStore.openPalette', 'toggleBatchSelect',
    'handleSessionMenuClick', 'renameSessionTitle', 'toggleBatchSelectAll', 'handleInlineBatchDelete',
  ]) {
    assert.ok(active.includes(binding), `sidebar visual adapter lost business binding: ${binding}`)
  }
})
