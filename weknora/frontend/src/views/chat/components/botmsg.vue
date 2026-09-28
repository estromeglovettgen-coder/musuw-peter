<template>
  <article class="visual-assistant-message" :class="{ 'is-embedded': embeddedMode }">
    <div v-if="isAgentError" class="visual-assistant-agent-error" role="alert">
      <t-icon name="error-circle" aria-hidden="true" />
      <span>{{ agentErrorText }}</span>
    </div>

    <div v-else class="visual-assistant-message__context">
      <div
        v-if="!session.isAgentMode && mentionedItems && mentionedItems.length > 0"
        class="visual-assistant-resources"
      >
        <span
          v-for="item in mentionedItems"
          :key="item.id"
          class="visual-assistant-resource"
          :class="mentionTagClass(item)"
          :data-resource-type="item.type || 'file'"
        >
          <span class="visual-assistant-resource__icon" aria-hidden="true">
            <t-icon
              v-if="item.type === 'kb'"
              :name="item.kb_type === 'faq' ? 'chat-bubble-help' : 'folder'"
            />
            <t-icon v-else :name="mentionTagIcon(item)" />
          </span>
          <span class="visual-assistant-resource__name" :title="item.name">{{ item.name }}</span>
        </span>
      </div>

      <div v-if="session.isRagMode" class="visual-assistant-pipeline">
        <RagPipelineProgress :session="session" :embedded-mode="embeddedMode" />
        <AgentStreamDisplay
          v-if="session.isAgentMode"
          :session="session"
          :session-id="sessionId"
          :user-query="userQuery"
          :rag-mode="true"
          :follow-up-loading="followUpLoading"
          @render-complete-change="emit('render-complete-change', $event)"
        />
      </div>
      <template v-else>
        <!-- A plain answer has no timeline to put the memory row on, so it gets
             the standalone row. Agent turns render theirs inside their timeline. -->
        <RagPipelineProgress
          v-if="!session.isAgentMode && session.used_memories?.length"
          :session="session"
          :embedded-mode="embeddedMode"
          memory-only
        />
        <docInfo v-if="session.knowledge_references?.length" :session="session" />
        <AgentStreamDisplay
          v-if="session.isAgentMode"
          :session="session"
          :session-id="sessionId"
          :user-query="userQuery"
          :follow-up-loading="followUpLoading"
          @render-complete-change="emit('render-complete-change', $event)"
        />
      </template>
      <deepThink v-if="session.showThink && !session.isAgentMode" :deepSession="session" />
    </div>

    <section
      ref="parentMd"
      v-if="!isAgentError && !session.hideContent && !session.isAgentMode"
      class="visual-assistant-answer"
    >
      <div v-if="hasActualContent" class="visual-assistant-answer__content">
        <div class="visual-assistant-markdown" v-stable-html="renderedHTML" />
      </div>
      <div v-if="answerFullyRendered && (content || session.content)" class="visual-assistant-toolbar">
        <button
          type="button"
          class="visual-assistant-toolbar__button"
          :title="$t('agent.copy')"
          @click.stop="handleCopyAnswer"
        >
          <t-icon name="copy" />
        </button>
        <button
          type="button"
          class="visual-assistant-toolbar__button"
          :title="$t('agent.addToKnowledgeBase')"
          @click.stop="handleAddToKnowledge"
        >
          <t-icon name="bookmark-add" />
        </button>
        <span
          v-if="!authStore.isLiteMode && (hasArtifacts || artifactsCollecting)"
          class="visual-assistant-toolbar__artifact answer-toolbar__artifact"
          :class="{ 'is-collecting': artifactButtonCollecting }"
        >
          <button
            type="button"
            class="visual-assistant-toolbar__button"
            :disabled="artifactButtonCollecting"
            :title="hasArtifacts ? $t('agent.artifactDrawer.buttonTitle') : $t('agent.artifactDrawer.collecting')"
            @click.stop="openArtifactDrawer()"
          >
            <t-icon v-if="artifactButtonCollecting" name="loading" class="visual-assistant-toolbar__artifact-spinner answer-toolbar__artifact-spinner" />
            <t-icon v-else name="folder" />
          </button>
          <span v-if="hasArtifacts" class="visual-assistant-toolbar__artifact-count answer-toolbar__artifact-count" aria-hidden="true">{{ artifactCount }}</span>
        </span>
        <t-tooltip
          v-if="session.is_fallback"
          :content="$t('chat.fallbackHint')"
          placement="top"
        >
          <button
            type="button"
            class="visual-assistant-toolbar__button is-muted"
            :title="$t('chat.fallbackHint')"
          >
            <t-icon name="info-circle" />
          </button>
        </t-tooltip>
        <ChatRequestInfoButton
          v-if="showRequestInfo"
          :session="session"
          :session-id="sessionId"
        />
        <Transition name="visual-follow-up-loading">
          <span
            v-if="followUpLoading"
            class="visual-assistant-toolbar__loading"
            role="status"
            aria-live="polite"
          >
            <t-icon name="lightbulb" />
            <span>{{ t('chat.followUpQuestionsLoading') }}</span>
          </span>
        </Transition>
      </div>
      <div v-if="isImgLoading" class="visual-assistant-image-loading">
        <t-loading size="small" />
        <span>{{ $t('common.loading') }}</span>
      </div>
    </section>

    <picturePreview
      v-if="reviewImg && reviewUrl"
      :reviewImg="reviewImg"
      :reviewUrl="reviewUrl"
      @closePreImg="closePreImg"
    />
    <ChatCitationFloat
      :float="citationFloat"
      :on-enter="cancelCitationClose"
      :on-leave="scheduleCitationClose"
    />
    <ChatArtifactsDrawer
      v-if="!authStore.isLiteMode && hasArtifacts"
      v-model:visible="showArtifactDrawer"
      :session-id="sessionId"
      :message-id="messageIdForArtifacts"
      :artifacts="artifactList"
      :preview-index="artifactPreviewIndex"
    />
  </article>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch, computed, ref, nextTick, onUpdated } from 'vue';
import 'katex/dist/katex.min.css';
import docInfo from './docInfo.vue';
import deepThink from './deepThink.vue';
import AgentStreamDisplay from './AgentStreamDisplay.vue';
import RagPipelineProgress from './RagPipelineProgress.vue';
import ChatRequestInfoButton from '@/components/ChatRequestInfoButton.vue';
import ChatCitationFloat from '@/components/ChatCitationFloat.vue';
import picturePreview from '@/components/picture-preview.vue';
import ChatArtifactsDrawer from './ChatArtifactsDrawer.vue';
import { isCollectingSkillArtifacts } from '@/utils/skillArtifacts';
import { sanitizeMarkdownHTML, safeMarkdownToHTML, createSafeImage, isValidImageURL, hydrateProtectedFileImages } from '@/utils/security';
import {
    artifactIndexFromEventTarget,
    hydrateArtifactImages,
    isArtifactRefHref,
    renderArtifactReference,
} from '@/utils/sandboxArtifactRefs';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { useUIStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import {
    buildManualMarkdown,
    formatManualTitle,
} from '@/utils/chatMessageShared';
import { copyWithToast } from '@/utils/clipboard';
import {
    createChatMarkdownRenderer,
    renderChatMarkdown,
} from '@/utils/chatMarkdownRenderer';
import {
    createMermaidCodeRenderer,
    ensureMermaidInitialized,
    renderMermaidInContainer,
    enhanceMarkdownContainer,
} from '@/utils/mermaidShared';
import { refreshMarkdownEnhancements } from '@/utils/markdownEnhancements';
import { useChatCitationPopover } from '@/composables/useChatCitationPopover';
import { useTypewriter } from '@/composables/useTypewriter';
import { vStableHtml } from '@/directives/stableHtml';
import { SKILL_ICON } from '@/types/mention';

ensureMermaidInitialized();

const mentionTagClass = (item) => {
    if (item.type === 'kb') return item.kb_type === 'faq' ? 'faq-tag' : 'kb-tag';
    return `${item.type || 'file'}-tag`;
};

const mentionTagIcon = (item) => {
    if (item.type === 'tag') return 'tag';
    if (item.type === 'mcp') return 'tools';
    if (item.type === 'skill') return SKILL_ICON;
    return 'file';
};

const emit = defineEmits(['scroll-bottom', 'render-complete-change'])
const { t } = useI18n()
const uiStore = useUIStore();
const authStore = useAuthStore();
let parentMd = ref()
const { float: citationFloat, rebind: rebindCitations, cancelClose: cancelCitationClose, scheduleClose: scheduleCitationClose } = useChatCitationPopover(parentMd, {
    getKnowledgeReferences: () => props.session?.knowledge_references,
    marketplaceProductId: () => props.session?.marketplace_product_id,
    sessionId: () => props.sessionId,
});
let reviewUrl = ref('')
let reviewImg = ref(false)
let isImgLoading = ref(false);
const props = defineProps({
    // 必填项
    content: {
        type: String,
        required: false
    },
    session: {
        type: Object,
        required: false
    },
    userQuery: {
        type: String,
        required: false,
        default: ''
    },
    isFirstEnter: {
        type: Boolean,
        required: false
    },
    embeddedMode: {
        type: Boolean,
        default: false
    },
    sessionId: {
        type: String,
        default: ''
    },
    followUpLoading: {
        type: Boolean,
        default: false
    }
});

const showRequestInfo = computed(() => !!(props.session?.request_id || props.session?.id));

// Agent terminal errors arrive without an event stream, so keep an explicit
// marker separate from ordinary agent content. The parent render predicate
// uses the same marker; this prevents a stale hidden shell from becoming a
// visible row while still giving failures a durable, accessible message.
const isAgentError = computed(() =>
    props.session?.agent_error === true,
);
const agentErrorText = computed(() => {
    const value = props.content || props.session?.content || '';
    return typeof value === 'string' ? value : String(value || '');
});

// -----------------------------------------------------------------------------
// Skill artifact download (drawer)
// -----------------------------------------------------------------------------
// The download button and drawer are opt-in per message: the toolbar checks
// `hasArtifacts` and only renders when the assistant message actually
// recorded a file. `messageIdForArtifacts` resolves to whichever field the
// caller uses to identify the row on the server (session.id from the SSE
// hydration path, request_id when the caller pre-populated it).
//
// NOTE: this file's <script setup> block is plain JS (no lang="ts"), so we
// stay away from TypeScript-only syntax like `as any[]` — the vite Vue
// plugin routes non-TS blocks through babel which rejects those tokens.
const showArtifactDrawer = ref(false);
const artifactList = computed(() => {
    if (authStore.isLiteMode) return [];
    const raw = props.session && props.session.artifacts;
    const list = Array.isArray(raw) ? raw : [];
    // Enrich each entry with its position so the download endpoint can
    // resolve it. Server responses already include `index` when they come
    // via listMessageArtifacts; SSE payloads that land through Message.Artifacts
    // omit it. Normalising here keeps ChatArtifactsDrawer index-agnostic.
    return list.map((a, i) => ({ index: i, ...a }));
});
const hasArtifacts = computed(() => artifactList.value.length > 0);
const artifactCount = computed(() => artifactList.value.length);
const artifactsCollecting = computed(() => isCollectingSkillArtifacts(props.session));
const artifactButtonCollecting = computed(() => artifactsCollecting.value && !hasArtifacts.value);
const messageIdForArtifacts = computed(() => {
    // Prefer the persistent message ID; fall back to request_id for the
    // in-flight path where the SSE stream still identifies rows by request.
    return String((props.session && (props.session.id || props.session.request_id)) || '');
});
// Set when the drawer is opened by clicking an inline artifact card, so it
// lands directly on that file's preview instead of the list.
const artifactPreviewIndex = ref(null);
function openArtifactDrawer(previewIndex = null) {
    if (authStore.isLiteMode || !hasArtifacts.value) return;
    artifactPreviewIndex.value = previewIndex;
    showArtifactDrawer.value = true;
}

const artifactRefContext = computed(() => {
    const messageId = messageIdForArtifacts.value;
    if (!props.sessionId || !messageId) return null;
    return { sessionId: props.sessionId, messageId };
});

const artifactRefLabels = computed(() => ({
    previewHint: t('agent.artifactDrawer.inlinePreviewHint'),
    missingHint: t('agent.artifactDrawer.inlineMissing'),
}));

const preview = (url) => {
    nextTick(() => {
        reviewUrl.value = url;
        reviewImg.value = true
    })
}

const closePreImg = () => {
    reviewImg.value = false
    reviewUrl.value = '';
}

const markdownRenderer = createChatMarkdownRenderer({
    codeRenderer: createMermaidCodeRenderer('mermaid-botmsg'),
    imageRenderer: ({ href, title, text }) => {
        // A sandbox-generated file shares the resource:// form with every other
        // protected image, so it is matched against this message's artifacts
        // first. Anything that does not belong to this reply falls through to
        // the ordinary protected-image path.
        const artifactHtml = renderArtifactReference({
            href,
            alt: text || '',
            artifacts: artifactList.value,
            labels: artifactRefLabels.value,
            context: artifactRefContext.value,
            streaming: !props.session?.is_completed,
        });
        if (artifactHtml !== null) return artifactHtml;
        return createSafeImage(href, text || '', title || '');
    },
    invalidImageHtml: () => `<p>${t('error.invalidImageLink')}</p>`,
    isValidImageUrl: (href) => (!authStore.isLiteMode && isArtifactRefHref(href)) || isValidImageURL(href),
});

// 计算属性：将 Markdown 文本转换为 tokens
const mentionedItems = computed(() => {
    return props.session?.mentioned_items || [];
});

// Smooth the streamed answer into a steady typewriter cadence (shared with the
// Agent path). Copy/toolbar still read the full content; only display is paced.
const answerText = computed(() => {
    const text = props.content || props.session?.content || '';
    return typeof text === 'string' ? text : '';
});
const { displayed: typedAnswer } = useTypewriter(
    () => answerText.value,
    () => Boolean(props.session?.is_completed),
);

// The backend completion event can arrive while the local typewriter still has
// buffered text to reveal. Treat the answer as visually complete only after the
// displayed text has caught up, so actions never appear beside a moving answer.
const answerFullyRendered = computed(() =>
    Boolean(props.session?.is_completed) && typedAnswer.value.length >= answerText.value.length
);

watch(
    answerFullyRendered,
    (ready) => {
        if (!props.session?.isAgentMode) emit('render-complete-change', ready);
    },
    { immediate: true },
);

// 单次渲染整个 Markdown 内容（替代 token-by-token，修复 KaTeX 公式在 streaming 时闪烁消失的问题）
const renderedHTML = computed(() => {
    const text = typedAnswer.value;
    if (!text || typeof text !== 'string') return '';
    return renderChatMarkdown(text, {
        renderer: markdownRenderer,
        escapeMarkdown: safeMarkdownToHTML,
        sanitizeHtml: sanitizeMarkdownHTML,
        streaming: !props.session?.is_completed,
        knowledgeReferences: props.session?.knowledge_references,
    });
});

// 计算属性：判断是否有实际内容（非空且不只是空白）
const hasActualContent = computed(() => {
    const text = props.content || props.session?.content || '';
    return text && text.trim().length > 0;
});

// 获取实际内容
const getActualContent = () => {
    return (props.content || props.session?.content || '').trim();
};

// 复制回答内容
const handleCopyAnswer = async () => {
    const content = getActualContent();
    if (!content) {
        MessagePlugin.warning(t('agentStream.copy.emptyContent'));
        return;
    }

    await copyWithToast(content, 'agentStream.copy.success', 'agentStream.copy.failed');
};

// 添加到知识库
const handleAddToKnowledge = () => {
    const content = getActualContent();
    if (!content) {
        MessagePlugin.warning(t('agentStream.saveToKb.emptyContent'));
        return;
    }

    const question = (props.userQuery || '').trim();
    const manualContent = buildManualMarkdown(question, content);
    const manualTitle = formatManualTitle(question);

    uiStore.openManualEditor({
        mode: 'create',
        title: manualTitle,
        content: manualContent,
        status: 'draft',
    });

    MessagePlugin.info(t('agentStream.saveToKb.editorOpened'));
};

// 处理 markdown-content 中图片的点击事件
const handleMarkdownImageClick = (e) => {
    const target = e.target;
    const artifactIndex = artifactIndexFromEventTarget(target);
    if (artifactIndex !== null) {
        e.preventDefault();
        e.stopPropagation();
        openArtifactDrawer(artifactIndex);
        return;
    }
    if (target && target.tagName === 'IMG') {
        const src = target.getAttribute('src');
        if (src) {
            e.preventDefault();
            e.stopPropagation();
            preview(src);
        }
    }
};

watch(renderedHTML, () => {
    nextTick(() => {
        rebindCitations();
    });
});

// 渲染 Mermaid 图表的函数
onUpdated(() => {
    nextTick(async () => {
        await hydrateProtectedFileImages(parentMd.value);
        if (!authStore.isLiteMode) await hydrateArtifactImages(parentMd.value, artifactRefContext.value);
        refreshMarkdownEnhancements(parentMd.value);
        if (props.session?.is_completed) {
            await renderMermaidInContainer(parentMd.value);
        }
    });
});

onMounted(async () => {
    // 为 markdown-content 中的图片添加点击事件
    nextTick(async () => {
        if (parentMd.value) {
            parentMd.value.addEventListener('click', handleMarkdownImageClick, true);
        }
        rebindCitations();
        await hydrateProtectedFileImages(parentMd.value);
        if (!authStore.isLiteMode) await hydrateArtifactImages(parentMd.value, artifactRefContext.value);
        await enhanceMarkdownContainer(parentMd.value);
    });
});

onBeforeUnmount(() => {
    if (parentMd.value) {
        parentMd.value.removeEventListener('click', handleMarkdownImageClick, true);
    }
});
</script>

<style scoped lang="less">
@import '../../../components/css/chat-markdown.less';
@import '../../../components/css/chat-citations.less';
.visual-assistant-message { width: 100%; min-width: 0; margin-right: auto; color: #111827; font-size: 14.5px; text-align: left; }
.visual-assistant-message.is-embedded { width: 100%; }
.visual-assistant-message.is-embedded :deep(.agent-stream-display) { width: 100%; }
.visual-assistant-agent-error { min-width: 0; margin: 2px 0; padding: 10px 12px; border: 1px solid var(--td-error-color-focus, rgb(220 38 38 / 24%)); border-radius: 10px; display: flex; align-items: flex-start; gap: 8px; background: var(--td-error-color-light, rgb(220 38 38 / 6%)); color: var(--td-error-color, #b91c1c); line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }
.visual-assistant-agent-error :deep(.t-icon) { flex: 0 0 auto; margin-top: 3px; font-size: 16px; }
.visual-assistant-message__context { display: flex; flex-direction: column; gap: 12px; }
.visual-assistant-resources { display: flex; flex-wrap: wrap; gap: 8px; }
.visual-assistant-resource { max-width: 240px; min-height: 28px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #4b5563; font-size: 12px; line-height: 18px; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-assistant-resource__icon { flex: 0 0 14px; width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; color: #9ca3af; }
.visual-assistant-resource__icon :deep(.t-icon) { font-size: 14px; }
.visual-assistant-resource__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-assistant-pipeline { display: flex; flex-direction: column; gap: 0; }
.visual-assistant-answer { min-width: 0; }
.visual-assistant-answer__content { padding: 0 8px 0 0; }
.visual-assistant-markdown { min-width: 0; .chat-markdown-typography(); .chat-citation-pills(); }
.visual-assistant-markdown :deep(img) { max-width: 80%; max-height: 300px; width: auto; height: auto; margin: 10px 0; border: 1px solid #e5e7eb; border-radius: 12px; display: block; object-fit: contain; cursor: pointer; }
.visual-assistant-toolbar { min-height: 28px; margin-top: 6px; padding-top: 6px; display: flex; align-items: center; gap: 6px; color: #9ca3af; opacity: 0; transition: opacity 150ms ease; user-select: none; }
.visual-assistant-message:hover .visual-assistant-toolbar,.visual-assistant-toolbar:focus-within { opacity: 1; }
.visual-assistant-toolbar__button { width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-assistant-toolbar__button:hover { background: #f3f4f6; color: #374151; }
.visual-assistant-toolbar__button.is-muted { color: #9ca3af; }
.visual-assistant-toolbar__button :deep(.t-icon) { font-size: 16px; }
.visual-assistant-toolbar__loading { min-width: 0; margin-left: 4px; padding: 4px 8px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; background: #f9fafb; color: #9ca3af; font-size: 10px; line-height: 14px; }
.visual-assistant-toolbar__loading :deep(.t-icon) { font-size: 12px; }
.visual-assistant-image-loading { width: 230px; height: 230px; margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 7px; background: #f9fafb; color: #9ca3af; font-size: 11px; }
.visual-follow-up-loading-enter-active,.visual-follow-up-loading-leave-active { transition: opacity 140ms ease,transform 140ms ease; }
.visual-follow-up-loading-enter-from,.visual-follow-up-loading-leave-to { opacity: 0; transform: translateY(2px); }
@media (max-width: 767px) { .visual-assistant-message { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .visual-assistant-toolbar,.visual-follow-up-loading-enter-active,.visual-follow-up-loading-leave-active { transition: none !important; } }
</style>
