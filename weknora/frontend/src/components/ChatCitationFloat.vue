<template>
  <Teleport to="body">
    <Transition name="visual-citation-float">
      <aside
        v-if="float.visible"
        class="visual-citation-float"
        :class="[`is-${float.type}`, { 'is-loading': float.loading, 'is-error': Boolean(float.error) }]"
        :style="{ top: `${float.top}px`, left: `${float.left}px` }"
        @mouseenter="onEnter?.()"
        @mouseleave="onLeave?.()"
      >
        <template v-if="float.type === 'web'">
          <div class="visual-citation-float__source"><t-icon name="link" /><span>Web</span></div>
          <strong :title="float.title || float.url">{{ float.title || float.url }}</strong>
          <a v-if="float.url" :href="float.url" target="_blank" rel="noopener noreferrer" :title="float.url">{{ float.url }}</a>
        </template>
        <template v-else>
          <div class="visual-citation-float__source"><t-icon name="file" /><span>{{ float.title }}</span></div>
          <div v-if="float.loading" class="visual-citation-float__state"><span class="visual-citation-float__spinner" />{{ loadingText }}</div>
          <div v-else-if="float.error" class="visual-citation-float__state is-error"><t-icon name="close-circle" />{{ float.error }}</div>
          <p v-else>{{ float.content }}</p>
        </template>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CitationFloatState } from '@/composables/useChatCitationPopover'

defineProps<{
  float: CitationFloatState
  onEnter?: () => void
  onLeave?: () => void
}>()

const { t } = useI18n()
const loadingText = t('common.loading')
</script>

<style scoped lang="less">
.visual-citation-float { position: absolute; z-index: 10020; width: min(340px, calc(100vw - 24px)); max-height: 260px; overflow: auto; padding: 10px 11px; box-sizing: border-box; border: 1px solid #e5e7eb; border-radius: 11px; background: rgb(255 255 255 / 98%); color: #374151; box-shadow: 0 14px 34px rgb(15 23 42 / 14%); backdrop-filter: blur(8px); }
.visual-citation-float__source { min-width: 0; margin-bottom: 5px; display: flex; align-items: center; gap: 6px; color: #9ca3af; font-size: 9px; line-height: 14px; }
.visual-citation-float__source :deep(.t-icon) { flex: 0 0 12px; font-size: 12px; }
.visual-citation-float__source span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-citation-float strong { display: block; overflow: hidden; color: #111827; font-size: 11px; line-height: 17px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.visual-citation-float a { display: block; margin-top: 4px; overflow: hidden; color: #6b7280; font-size: 9px; line-height: 14px; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.visual-citation-float a:hover { color: #111827; text-decoration: underline; }
.visual-citation-float p,.visual-citation-float__state { margin: 0; color: #6b7280; font-size: 10px; line-height: 16px; white-space: pre-wrap; word-break: break-word; }
.visual-citation-float__state { display: flex; align-items: center; gap: 6px; }
.visual-citation-float__state.is-error { color: #dc2626; }
.visual-citation-float__state :deep(.t-icon) { flex: 0 0 11px; font-size: 11px; }
.visual-citation-float__spinner { flex: 0 0 10px; width: 10px; height: 10px; border: 1px solid #9ca3af; border-right-color: transparent; border-radius: 50%; animation: visual-citation-spin .8s linear infinite; }
@keyframes visual-citation-spin { to { transform: rotate(360deg); } }
.visual-citation-float-enter-active,.visual-citation-float-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.visual-citation-float-enter-from,.visual-citation-float-leave-to { opacity: 0; transform: translateY(2px); }
@media (prefers-reduced-motion: reduce) { .visual-citation-float__spinner { animation: none; } .visual-citation-float-enter-active,.visual-citation-float-leave-active { transition: none !important; } }
</style>
