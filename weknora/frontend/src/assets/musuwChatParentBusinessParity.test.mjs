import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('audited chat parent controller remains locked after server-authorized marketplace chat integration', () => {
  assert.equal(
    blobSha(read('./business-baselines/ChatIndex.pre-view.vue')),
    '49e439ef2fc54b2a5a5403ed6eae15d5a647a9af',
  )
})

test('rebuilt chat parent reuses normalized frozen setup without legacy shell classes', () => {
  const source = read('../views/chat/index.vue')
  assert.match(source, /import LegacyChatBusiness from .*ChatIndex\.pre-view\.vue/)
  assert.match(source, /const legacySetup = legacy\.setup/)
  assert.match(source, /return \{\s*\.\.\.state,/)
  assert.match(source, /class="visual-chat-view"/)
  for (const token of [
    'class="chat"',
    'class="chat_scroll_box"',
    'class="msg_list"',
    'class="input-container"',
    'class="suggested-questions-container"',
  ]) assert.equal(source.includes(token), false, `chat parent still exposes ${token}`)
})

test('rebuilt chat layout retains history, suggestions, stream wait, follow-ups, composer and drawers', () => {
  const source = read('../views/chat/index.vue')
  for (const token of [
    'historyLoading && messagesList.length === 0',
    'suggestedQuestionsLoading',
    'fetchSuggestedQuestions',
    ':key="session.id || `${session.role}-${session.created_at}-${index}`"',
    'shouldRenderAssistantMessage(session)',
    'handleAnswerRenderComplete(session, ready)',
    'FollowUpSuggestions',
    'showGlobalTypingIndicator',
    'InputField',
    'handleStopGeneration',
    'ChatReferencesDrawer',
    'ChatAttachmentPreviewDrawer',
  ]) assert.ok(source.includes(token), `chat parent lost ${token}`)
})

test('chat-only components imported by the options wrapper are registered', () => {
  const source = read('../views/chat/index.vue')
  assert.match(source, /components:\s*\{[\s\S]*ChatQuestionMinimap,\s*MessageTimestamp,[\s\S]*\}/)
})
