import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const read = (relativePath) => readFileSync(join(here, relativePath), 'utf8')

const agent = read('AgentStreamDisplay.vue')
const rag = read('RagPipelineProgress.vue')
const input = read('../../../components/Input-field.vue')
const createChat = read('../../creatChat/creatChat.vue')
const chat = read('../index.vue')

test('new chat keeps greeting, starter cards, and composer on one reading column', () => {
  assert.match(createChat, /class="visual-new-chat-stack"/)
  assert.match(createChat, /\.visual-new-chat-stack\s*\{[\s\S]*?width:\s*min\(768px, calc\(100% - 64px\)\)/)
  assert.match(createChat, /\.visual-new-chat-title\s*\{[\s\S]*?font-size:\s*32px/)
  assert.match(createChat, /class="visual-new-chat-suggestions"/)
  assert.match(createChat, /class="visual-new-chat-composer"/)
  assert.doesNotMatch(createChat, /transform:\s*translateX\(-(?:250|329)px\)/)
})

test('composer preserves every existing action surface', () => {
  for (const token of [
    'triggerImageUpload', 'attachmentUploadRef?.triggerFileSelect()', 'triggerMention',
    'toggleWebSearch', 'selectedReasoningLabel', 'reasoningOptions', 'openModelPicker',
    'handleStop', 'createSession(query)',
  ]) assert.ok(input.includes(token), `composer lost ${token}`)
  assert.match(input, /v-for="model in availableModels"/)
  assert.match(input, /@mousedown\.prevent="triggerMention"/)
})

test('agent and RAG timelines keep aligned rails and inline thinking', () => {
  assert.match(agent, /--agent-step-rail-offset:\s*28px/)
  assert.match(agent, /--agent-step-rail-x:\s*8px/)
  assert.match(rag, /class="visual-rag-step__rail"/)
  assert.match(rag, /\.visual-rag-step\s*\{[^\n]*gap:\s*14px/)
  assert.match(rag, /class="visual-rag-step visual-rag-thinking"/)
  assert.match(rag, /class="visual-rag-thinking__content"/)
})

test('chat presentation honors reduced motion without changing message flow', () => {
  for (const source of [createChat, input, chat, agent, rag]) {
    assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  }
  assert.match(chat, /\.visual-chat-messages\s*\{[^\n]*gap:\s*32px/)
  assert.match(chat, /\.visual-chat-input\s*\{[^\n]*width:\s*min\(768px,calc\(100% - 32px\)\)/)
})
