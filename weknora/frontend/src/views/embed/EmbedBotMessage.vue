<template>
  <div class="embed-bot-msg" :class="{ 'is-embedded': embeddedMode }">
    <div v-if="isAgentError" class="embed-agent-error" role="alert">
      <t-icon name="error-circle" aria-hidden="true" />
      <span>{{ agentErrorText }}</span>
    </div>

    <div v-else-if="session?.isRagMode" class="rag-answer-stack">
      <RagPipelineProgress :session="session" embedded-mode />
      <AgentStreamDisplay v-if="session?.isAgentMode" :session="session" :session-id="sessionId" :user-query="userQuery"
        rag-mode :embedded-mode="embeddedMode" :embed-channel-id="embedChannelId" :embed-token="embedToken"
        :embed-session-sig="embedSessionSig" :embed-visitor-id="embedVisitorId" />
    </div>
    <template v-else-if="!isAgentError">
      <DocInfo v-if="session?.knowledge_references?.length" :session="session" embedded-mode />
      <AgentStreamDisplay v-if="session?.isAgentMode" :session="session" :session-id="sessionId" :user-query="userQuery"
        :embedded-mode="embeddedMode" :embed-channel-id="embedChannelId" :embed-token="embedToken"
        :embed-session-sig="embedSessionSig" :embed-visitor-id="embedVisitorId" />
    </template>
    <DeepThink v-if="!isAgentError && session?.showThink && !session?.isAgentMode" :deep-session="session" />
    <div v-if="!isAgentError && !session?.hideContent && !session?.isAgentMode" ref="parentMd">
      <div v-if="hasActualContent" class="content-wrapper">
        <div class="ai-markdown-template markdown-content" v-stable-html="renderedHTML" />
      </div>
    </div>
    <Teleport to="body">
      <div v-if="citationFloat.visible" class="embed-citation-float"
        :style="{ top: `${citationFloat.top}px`, left: `${citationFloat.left}px` }" @mouseenter="cancelCitationClose"
        @mouseleave="scheduleCitationClose">
        <template v-if="citationFloat.type === 'web'">
          <div class="embed-citation-float__title">{{ citationFloat.title || citationFloat.url }}</div>
          <a v-if="citationFloat.url" class="embed-citation-float__link" :href="citationFloat.url" target="_blank"
            rel="noopener noreferrer">{{ citationFloat.url }}</a>
        </template>
        <template v-else>
          <div class="embed-citation-float__title">{{ citationFloat.title }}</div>
          <div v-if="citationFloat.loading" class="embed-citation-float__muted">…</div>
          <div v-else-if="citationFloat.error" class="embed-citation-float__error">{{ citationFloat.error }}</div>
          <div v-else class="embed-citation-float__body">{{ citationFloat.content }}</div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUpdated, ref, watch } from 'vue'
import 'katex/dist/katex.min.css'
import {
  sanitizeMarkdownHTML,
  safeMarkdownToHTML,
  createSafeImage,
  isValidImageURL,
  hydrateProtectedFileImages,
} from '@/utils/security'
import type { ProtectedFileAccessContext } from '@/utils/protectedFileAccess'
import {
  createChatMarkdownRenderer,
  renderChatMarkdown,
} from '@/utils/chatMarkdownRenderer'
import {
  createMermaidCodeRenderer,
  ensureMermaidInitialized,
  enhanceMarkdownContainer,
} from '@/utils/mermaidShared'
import { useEmbedCitationPopover } from '@/composables/useEmbedCitationPopover'
import { useTypewriter } from '@/composables/useTypewriter'
import { vStableHtml } from '@/directives/stableHtml'

const RagPipelineProgress = defineAsyncComponent(
  () => import('@/views/chat/components/RagPipelineProgress.vue'),
)
const AgentStreamDisplay = defineAsyncComponent(
  () => import('@/views/chat/components/AgentStreamDisplay.vue'),
)
const DocInfo = defineAsyncComponent(
  () => import('@/views/chat/components/docInfo.vue'),
)
const DeepThink = defineAsyncComponent(
  () => import('@/views/chat/components/deepThink.vue'),
)

ensureMermaidInitialized()

const markdownRenderer = createChatMarkdownRenderer({
  codeRenderer: createMermaidCodeRenderer('mermaid-embed-botmsg'),
  imageRenderer: ({ href, title, text }) => createSafeImage(href, text || '', title || ''),
  isValidImageUrl: isValidImageURL,
})

type EmbedSession = {
  content?: string
  isRagMode?: boolean
  isAgentMode?: boolean
  showThink?: boolean
  hideContent?: boolean
  is_completed?: boolean
  agent_error?: boolean
  agentEventStream?: Array<Record<string, unknown>>
  knowledge_references?: Array<{ chunk_type?: string; knowledge_id?: string; knowledge_title?: string }>
}

const props = withDefaults(
  defineProps<{
    content?: string
    session?: EmbedSession
    sessionId?: string
    userQuery?: string
    embeddedMode?: boolean
    embedChannelId?: string
    embedToken?: string
    embedSessionSig?: string
    embedVisitorId?: string
  }>(),
  {
    content: '',
    session: () => ({}),
    sessionId: '',
    userQuery: '',
    embeddedMode: true,
    embedChannelId: '',
    embedToken: '',
    embedSessionSig: '',
    embedVisitorId: '',
  },
)

const isAgentError = computed(() =>
  props.session?.agent_error === true,
)
const agentErrorText = computed(() => {
  const value = props.content || props.session?.content || ''
  return typeof value === 'string' ? value : String(value || '')
})

const parentMd = ref<HTMLElement | null>(null)

const embedChannelIdRef = computed(() => props.embedChannelId)
const embedTokenRef = computed(() => props.embedToken)

const { float: citationFloat, rebind: rebindCitations } = useEmbedCitationPopover(
  parentMd,
  embedChannelIdRef,
  embedTokenRef,
  {
    getKnowledgeReferences: () => props.session?.knowledge_references,
  },
)

let citationCloseTimer: number | null = null
const cancelCitationClose = () => {
  if (citationCloseTimer) {
    window.clearTimeout(citationCloseTimer)
    citationCloseTimer = null
  }
}
const scheduleCitationClose = () => {
  cancelCitationClose()
  citationCloseTimer = window.setTimeout(() => {
    citationFloat.value.visible = false
  }, 120)
}

// Smooth the streamed answer into a steady typewriter cadence (shared with the
// Agent path). History reloads arrive complete and snap to full.
const answerText = computed(() => String(props.content || props.session?.content || ''))
const { displayed: typedAnswer } = useTypewriter(
  () => answerText.value,
  () => Boolean(props.session?.is_completed),
)

const renderedHTML = computed(() => {
  const text = typedAnswer.value
  if (!text.trim()) return ''
  return renderChatMarkdown(text, {
    renderer: markdownRenderer,
    escapeMarkdown: safeMarkdownToHTML,
    sanitizeHtml: sanitizeMarkdownHTML,
    streaming: !props.session?.is_completed,
  })
})

const hasActualContent = computed(() => {
  const text = String(props.content || props.session?.content || '')
  return text.trim().length > 0
})

const hydrateImages = async () => {
  const embedAccess: ProtectedFileAccessContext | undefined =
    props.embedChannelId && props.embedToken
      ? { mode: 'embed', channelId: props.embedChannelId, token: props.embedToken }
      : undefined
  await hydrateProtectedFileImages(parentMd.value, embedAccess)
}

const renderMermaidDiagrams = async () => {
  await enhanceMarkdownContainer(parentMd.value)
}

watch(renderedHTML, () => {
  nextTick(async () => {
    rebindCitations()
    await hydrateImages()
    if (props.session?.is_completed) {
      await renderMermaidDiagrams()
    }
  })
})

onUpdated(() => {
  nextTick(async () => {
    await hydrateImages()
    if (props.session?.is_completed) {
      await renderMermaidDiagrams()
    }
  })
})

onMounted(() => {
  nextTick(async () => {
    await hydrateImages()
    await renderMermaidDiagrams()
  })
})
</script>

<style scoped lang="less">
@import '../../components/css/chat-markdown.less';
@import '../../components/css/chat-citations.less';

.embed-bot-msg {
  border-radius: 4px;
  color: var(--musuw-ink, #1f2937);
  font-size: 14px;
  line-height: 1.65;
  margin-right: auto;
  max-width: 100%;
  box-sizing: border-box;

  &.is-embedded {
    width: 100%;

    :deep(.agent-stream-display) {
      width: 100%;
    }
  }
}

.embed-agent-error {
  min-width: 0;
  margin: 2px 0;
  padding: 10px 12px;
  border: 1px solid var(--td-error-color-focus, rgb(220 38 38 / 24%));
  border-radius: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--td-error-color-light, rgb(220 38 38 / 6%));
  color: var(--td-error-color, #b91c1c);
  line-height: 22px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  :deep(.t-icon) {
    flex: 0 0 auto;
    margin-top: 3px;
    font-size: 16px;
  }
}

.rag-answer-stack {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.content-wrapper {
  padding: 2px 0;
}

.markdown-content {
  // Chat Markdown visual styles are centralized in chat-markdown.less.
  // Do not add element-level Markdown rules here; update the shared mixin.
  .chat-markdown-typography();
  .chat-citation-pills();
}

.embed-citation-float {
  position: absolute;
  z-index: 10000;
  max-width: 320px;
  padding: 10px 12px;
  border: 1px solid var(--musuw-line, #e5e7eb);
  border-radius: var(--musuw-radius-control, 8px);
  background: var(--musuw-surface, #fff);
  box-shadow: var(--musuw-shadow-raised, 0 12px 32px rgba(38, 38, 38, 0.06));
  font-size: 12px;
  line-height: 1.5;
  color: var(--musuw-ink, #1f2937);

  &__title {
    font-weight: 600;
    color: var(--td-brand-color);
    margin-bottom: 4px;
  }

  &__link {
    color: var(--td-brand-color);
    word-break: break-all;
  }

  &__body {
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
  }

  &__muted {
    color: var(--td-text-color-placeholder);
  }

  &__error {
    color: var(--td-error-color);
  }
}
</style>
