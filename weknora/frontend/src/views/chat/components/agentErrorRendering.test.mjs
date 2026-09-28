import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const handler = read('../../../composables/useChatStreamHandler.ts')
const botMessage = read('./botmsg.vue')
const embedBotMessage = read('../../embed/EmbedBotMessage.vue')

test('terminal agent errors retain content and an explicit marker in both branches', () => {
  assert.equal((handler.match(/message\.agent_error = true/g) || []).length, 2)
  assert.equal((handler.match(/message\.content = errorMsg/g) || []).length, 3)
})

test('primary chat renders agent errors as an accessible Musuw message', () => {
  assert.match(
    botMessage,
    /<div v-if="isAgentError" class="visual-assistant-agent-error" role="alert">/,
  )
  assert.match(botMessage, /<div v-else class="visual-assistant-message__context">/)
  assert.match(botMessage, /const isAgentError = computed\(/)
  assert.match(botMessage, /!isAgentError && !session\.hideContent && !session\.isAgentMode/)
  assert.match(botMessage, /\.visual-assistant-agent-error[\s\S]*var\(--td-error-color-light/)
})

test('embedded chat renders the same agent error contract without mounting the stream shell', () => {
  assert.match(embedBotMessage, /<div v-if="isAgentError" class="embed-agent-error" role="alert">/)
  assert.match(embedBotMessage, /<div v-else-if="session\?\.isRagMode" class="rag-answer-stack">/)
  assert.match(embedBotMessage, /<template v-else-if="!isAgentError">/)
  assert.match(embedBotMessage, /const isAgentError = computed\(/)
  assert.match(embedBotMessage, /!isAgentError && !session\?\.hideContent && !session\?\.isAgentMode/)
  assert.match(embedBotMessage, /\.embed-agent-error[\s\S]*var\(--td-error-color-light/)
})
