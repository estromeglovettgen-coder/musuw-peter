import assert from 'node:assert/strict'
import test from 'node:test'
import { createRenderer, nextTick, reactive, ref, watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useChatStreamHandler } from './useChatStreamHandler.ts'

function mountStreamHandler(messagesList) {
  let handler
  const renderer = createRenderer({
    patchProp() {},
    insert() {},
    remove() {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = renderer.createApp({
    setup() {
      handler = useChatStreamHandler({
        messagesList,
        loading: ref(false),
        isReplying: ref(false),
        currentAssistantMessageId: ref(''),
        fullContent: ref(''),
        isAgentStreamSession: () => true,
        scrollToBottom() {},
        showCreditUpgradePrompt: false,
      })
      return () => null
    },
  })
  app.use(createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': {} } }))
  app.use(createRouter({ history: createMemoryHistory(), routes: [] }))
  app.mount({})
  return { handler, unmount: () => app.unmount() }
}

for (const history of [
  { name: 'an empty event stream', agentEventStream: [], initialLength: 0 },
  {
    name: 'reconstructed agent steps',
    agent_steps: [{ iteration: 1, reasoning_content: 'Previous thought' }],
    initialLength: 1,
  },
]) {
  test(`a resumed agent stream reacts to new thinking after ${history.name}`, async () => {
    const messagesList = reactive([])
    const { handler, unmount } = mountStreamHandler(messagesList)
    try {
      await handler.handleMsgList([{
        id: 'request-1',
        role: 'assistant',
        is_completed: false,
        ...history,
      }])

      const observedLengths = []
      const observedThinkingIds = []
      watch(
        () => messagesList[0].agentEventStream.length,
        (length) => observedLengths.push(length),
        { immediate: true },
      )
      watch(
        () => messagesList[0].agentEventStream,
        (stream) => observedThinkingIds.push(stream.at(-1)?.event_id ?? null),
        { immediate: true, deep: true },
      )

      handler.processStreamChunk({
        id: 'request-1',
        response_type: 'thinking',
        data: { event_id: 'thought-1' },
        content: 'Considering the request',
        done: false,
      })
      await nextTick()

      assert.equal(messagesList[0].agentEventStream.at(-1).event_id, 'thought-1')
      assert.deepEqual(observedLengths, [history.initialLength, history.initialLength + 1])
      assert.deepEqual(observedThinkingIds, [
        history.initialLength ? 'step-1-thought' : null,
        'thought-1',
      ])
    } finally {
      unmount()
    }
  })
}
