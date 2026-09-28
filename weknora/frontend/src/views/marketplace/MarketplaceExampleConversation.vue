<template>
  <div v-if="activeExample" class="market-example-conversation">
    <div class="market-example-questions" :aria-label="t('creatorMarketplace.examples')">
      <t-button
        v-for="(example, index) in examples"
        :key="index"
        theme="default"
        variant="text"
        class="market-example-question"
        :class="{ 'is-selected': index === selectedIndex }"
        :aria-pressed="index === selectedIndex"
        @click="selectExample(index)"
      >
        {{ example.question }}
      </t-button>
    </div>

    <div class="market-example-dialogue">
      <p class="market-example-query">{{ activeExample.question }}</p>
      <TypewriterAnswer :key="playback" :answer="activeExample.answer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch, withDirectives } from 'vue'
import DOMPurify from 'dompurify'
import { useI18n } from 'vue-i18n'
import { useTypewriter } from '@/composables/useTypewriter'
import { vStableHtml } from '@/directives/stableHtml'
import { createChatMarkdownRenderer, renderChatMarkdown } from '@/utils/chatMarkdownRenderer'
import { safeMarkdownToHTML } from '@/utils/security'

const props = defineProps<{ examples: { question: string; answer: string }[] }>()
const { t } = useI18n()
const selectedIndex = ref(0)
const playback = ref(0)
const activeExample = computed(() => props.examples[selectedIndex.value])

function selectExample(index: number) {
  selectedIndex.value = index
  playback.value += 1
}

watch(() => props.examples, () => selectExample(0))

// A keyed answer owns its animation, so switching examples also cancels the
// previous RAF and motion listener through the existing chat composable.
const TypewriterAnswer = defineComponent({
  name: 'MarketplaceTypewriterAnswer',
  props: { answer: { type: String, required: true } },
  setup(answerProps) {
    const { displayed } = useTypewriter(() => answerProps.answer, () => false, {
      minCps: 110,
      maxCps: 110,
    })
    const complete = computed(() => displayed.value === answerProps.answer)
    const renderer = createChatMarkdownRenderer({ imageRenderer: () => '' })
    const rendered = computed(() => renderChatMarkdown(displayed.value, {
      renderer,
      escapeMarkdown: safeMarkdownToHTML,
      // Public examples are text excerpts. Do not carry source links, embedded
      // media, styling or authenticated resource requests into the catalog.
      sanitizeHtml: html => DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'],
        ALLOWED_ATTR: [],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
      }),
      streaming: !complete.value,
    }))

    return () => withDirectives(h('div', {
      class: 'market-example-answer',
      'aria-live': 'polite',
      'aria-busy': !complete.value,
    }), [[vStableHtml, rendered.value]])
  },
})
</script>

<style scoped lang="less">
@import '../../components/css/chat-markdown.less';

.market-example-conversation {
  display: grid;
  grid-template-columns: minmax(190px, 28%) minmax(0, 1fr);
  align-items: start;
  gap: 30px;
}

.market-example-questions {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.market-example-question.t-button {
  width: 100%;
  height: auto;
  min-height: 44px;
  padding: 12px 14px;
  justify-content: flex-start;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--td-text-color-secondary);
  text-align: left;
  font-size: 14px;
  line-height: 1.6;

  :deep(.t-button__text) {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  &:hover, &.is-selected {
    color: var(--td-text-color-primary);
    background: var(--td-bg-color-secondarycontainer);
  }

  &.is-selected { font-weight: 600; }

  &:focus-visible {
    outline: 2px solid var(--td-text-color-primary);
    outline-offset: 2px;
  }
}

.market-example-dialogue {
  min-width: 0;
  padding-left: 30px;
  border-left: 1px solid var(--td-component-stroke);
}

.market-example-query {
  width: fit-content;
  max-width: 92%;
  margin: 0 0 28px auto;
  padding: 12px 16px;
  border-radius: 16px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-primary);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.market-example-answer {
  min-height: 80px;
  min-width: 0;
  overflow-wrap: anywhere;
  overflow-x: auto;
  .chat-markdown-typography();
}

@media (max-width: 760px) {
  .market-example-conversation { grid-template-columns: minmax(0, 1fr); gap: 22px; }
  .market-example-questions {
    display: flex;
    overflow-x: auto;
    padding: 3px;
    scroll-snap-type: x proximity;
  }
  .market-example-question.t-button {
    flex: 0 0 220px;
    max-width: 80vw;
    min-height: 68px;
    padding: 10px 12px;
    scroll-snap-align: start;

    :deep(.t-button__text) {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
  }
  .market-example-dialogue { padding: 22px 0 0; border-left: 0; border-top: 1px solid var(--td-component-stroke); }
  .market-example-query { margin-bottom: 22px; }
}
</style>
