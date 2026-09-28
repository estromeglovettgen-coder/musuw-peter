import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('rebuilt chat message surfaces expose visual roots without legacy shells', () => {
  const cases = [
    ['../views/chat/components/usermsg.vue', 'class="visual-user-message"', ['class="user_msg_container"', 'class="user_msg"', 'class="mentioned_tag"', 'class="user_attachment_card"']],
    ['../views/chat/components/botmsg.vue', 'class="visual-assistant-message"', ['class="bot_msg"', 'class="content-wrapper"', 'class="answer-toolbar"', 'class="mentioned_tag"']],
    ['../views/chat/components/docInfo.vue', 'class="visual-answer-references"', ['class="refer"', 'class="refer_header"', 'class="doc-group"', 'class="doc doc-web"']],
    ['../views/chat/components/deepThink.vue', 'class="visual-thinking-panel"', ['class="deep-think"', 'class="think-content"']],
    ['../views/chat/components/RagPipelineProgress.vue', 'class="visual-rag-pipeline"', ['class="rag-pipeline-progress"', 'class="tree-container"', 'class="tree-child"', 'class="action-card"']],
  ]
  for (const [path, root, legacy] of cases) {
    const source = read(path)
    assert.ok(source.includes(root), `${path} lost ${root}`)
    for (const token of legacy) assert.equal(source.includes(token), false, `${path} still contains ${token}`)
  }
})

test('assistant visual surface still exposes all non-reference native answer states', () => {
  const source = read('../views/chat/components/botmsg.vue')
  for (const token of ['session.isRagMode','session.isAgentMode','session.showThink','session.hideContent','answerFullyRendered','session.is_fallback','followUpLoading','isImgLoading','RagPipelineProgress','AgentStreamDisplay','deepThink','ChatRequestInfoButton','ChatCitationFloat']) {
    assert.ok(source.includes(token), `botmsg lost state surface: ${token}`)
  }
})

test('user message visual surface keeps image and attachment preview affordances', () => {
  const source = read('../views/chat/components/usermsg.vue')
  for (const token of ['hydrateProtectedFileImages','isPreviewableAttachment','resolveAttachmentFileType','attachmentPreviewDrawer.open({','reviewImg.value = true','visual-user-message__images','visual-user-message__attachments']) {
    assert.ok(source.includes(token), `usermsg lost ${token}`)
  }
})

test('chat image viewers only mount when a real preview is open', () => {
  for (const path of ['../views/chat/components/usermsg.vue', '../views/chat/components/botmsg.vue']) {
    const source = read(path)
    assert.match(source, /<picturePreview\s+v-if="reviewImg && reviewUrl"/, `${path} mounts an empty image viewer`)
  }
  const agentStream = read('../views/chat/components/AgentStreamDisplay.vue')
  assert.ok(agentStream.includes('<picturePreview v-if="imagePreviewVisible && imagePreviewUrl"'), 'AgentStreamDisplay mounts an empty image viewer')
})

test('thinking panel keeps native running, completion, folding and streaming-scroll behavior', () => {
  const source = read('../views/chat/components/deepThink.vue')
  for (const token of ['props.deepSession?.thinking === false','oldVal === true && newVal === false','props.deepSession?.thinkContent','contentInnerRef.value.scrollTop = contentInnerRef.value.scrollHeight','if (!props.deepSession?.thinking) isFold.value = !isFold.value']) {
    assert.ok(source.includes(token), `deepThink lost ${token}`)
  }
})

test('RAG timeline preserves wait, stalled, retrieval, thinking, reference and completion states', () => {
  const source = read('../views/chat/components/RagPipelineProgress.vue')
  for (const token of [
    'RAG_TIMELINE_TOOL_NAMES.has(event.tool_name)',
    'RAG_RETRIEVAL_TOOL_NAMES.has(toolName)',
    "toolName === 'attachment_parsing' || toolName === 'image_analysis'",
    'getKnowledgeSearchSummaryHtml',
    'getAttachmentParsingSummaryHtml',
    'createRagWaitController',
    'getRagPipelineWaitKind',
    'waitView.value.stalled',
    "t('chat.modelStillResponding')",
    "t('chat.connectingModelAndGeneratingAnswer')",
    'hasThinkingEvent',
    'thinkingContent',
    'showDoneRow',
    'referencesDrawer.toggle({',
    'hasReferences.value',
    'visual-rag-thinking__content',
  ]) assert.ok(source.includes(token), `RagPipelineProgress lost ${token}`)
})
