import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'RagPipelineProgress.vue'), 'utf8')

test('RAG timeline preserves pending, tool, thinking, done, collapsed, and memory states', () => {
  for (const token of [
    'showPrePipelineWait', 'v-for="step in steps"', 'showWaitStep', 'showThinkingStep',
    'showDoneRow', 'showCollapsedRoot', 'showExpandedTimeline', 'toggleExpanded',
    'getAgentToolIconName', 'getRagPipelineStepTitle', 'getAttachmentParsingSummaryHtml',
    '<ChatMemoryStep', 'memoryIsLast',
  ]) assert.ok(source.includes(token), `RAG timeline lost ${token}`)
})
test('RAG timeline uses a stable live region and native wait controller', () => {
  assert.match(source, /class="visual-rag-pipeline__sr" role="status" aria-live="polite"/)
  assert.match(source, /createRagWaitController/)
  assert.match(source, /getRagPipelineWaitKind/)
  assert.match(source, /waitController\.dispose\(\)/)
  assert.match(source, /chat\.connectingModelAndGeneratingAnswer/)
  assert.match(source, /chat\.modelStillResponding/)
})

test('RAG retrieval opens the shared references drawer and keeps thinking scroll behavior', () => {
  assert.match(source, /useChatReferencesDrawer/)
  assert.match(source, /canOpenReferences/)
  assert.match(source, /handleStepClick/)
  assert.match(source, /referencesDrawer\.toggle\(/)
  assert.match(source, /scrollThinkingDetailToBottom/)
  assert.match(source, /watch\(thinkingContent/)
})

test('RAG visual layer is compact, clickable only when actionable, and reduced-motion safe', () => {
  assert.match(source, /button\.visual-rag-step\.is-clickable \{ cursor: pointer; \}/)
  assert.match(source, /\.visual-rag-step\s*\{[^\n]*padding: 0 0 14px/)
  assert.match(source, /\.visual-rag-thinking__content \{ max-height: 220px; overflow-y: auto;/)
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/)
})

test('memory-only hosts render the reusable memory row without rebuilding a pipeline', () => {
  assert.match(source, /memoryOnly\?: boolean/)
  assert.match(source, /<ChatMemoryStep[\s\S]*:is-last="memoryIsLast"/)
  assert.match(source, /<template v-if="!memoryOnly">/)
  assert.match(source, /if \(props\.memoryOnly\) return hasMemory\.value/)
})

test('only timeline-less answers get the standalone memory row', () => {
  const botmsg = readFileSync(join(here, 'botmsg.vue'), 'utf8')
  assert.match(
    botmsg,
    /<RagPipelineProgress[\s\S]*?v-if="!session\.isAgentMode && session\.used_memories\?\.length"[\s\S]*?memory-only/,
  )
})

test('memory row state is shared by both timelines', () => {
  assert.match(source, /useChatMemoryRow\(\(\) => props\.session\?\.used_memories\)/)
  const agent = readFileSync(join(here, 'AgentStreamDisplay.vue'), 'utf8')
  assert.match(agent, /useChatMemoryRow\(/)
})
