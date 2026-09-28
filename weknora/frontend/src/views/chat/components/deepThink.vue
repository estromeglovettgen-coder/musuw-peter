<template>
  <section class="visual-thinking-panel" :class="{ 'is-running': deepSession?.thinking, 'is-folded': isFold }">
    <button type="button" class="visual-thinking-panel__header" :disabled="deepSession?.thinking" @click="toggleFold">
      <span class="visual-thinking-panel__status">
        <span v-if="deepSession?.thinking" class="visual-thinking-panel__spinner" aria-hidden="true" />
        <t-icon v-else name="check-circle" class="visual-thinking-panel__done" />
        <span>{{ deepSession?.thinking ? $t('chat.thinking') : $t('chat.deepThoughtCompleted') }}</span>
      </span>
      <t-icon v-if="!deepSession?.thinking" name="chevron-down" class="visual-thinking-panel__chevron" :class="{ 'is-folded': isFold }" />
    </button>
    <div v-show="!isFold || deepSession?.thinking" class="visual-thinking-panel__body">
      <div ref="contentInnerRef" class="visual-thinking-panel__content">{{ deepSession?.thinkContent }}</div>
    </div>
  </section>
</template>
<script setup>
import { watch, ref, onMounted, nextTick } from 'vue';
const isFold = ref(false)
const contentInnerRef = ref(null)
const props = defineProps({ deepSession: { type: Object, required: false } });
onMounted(() => { if (props.deepSession?.thinking === false) isFold.value = true; });
watch(() => props.deepSession?.thinking, (newVal, oldVal) => { if (oldVal === true && newVal === false) isFold.value = true; });
watch(() => props.deepSession?.thinkContent, () => {
  if (props.deepSession?.thinking) nextTick(() => { if (contentInnerRef.value) contentInnerRef.value.scrollTop = contentInnerRef.value.scrollHeight; });
});
const toggleFold = () => { if (!props.deepSession?.thinking) isFold.value = !isFold.value; }
</script>
<style scoped lang="less">
.visual-thinking-panel { width: 100%; margin: 0 0 12px; color: #6b7280; }
.visual-thinking-panel__header { margin-left: -6px; padding: 4px 6px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #6b7280; font: inherit; font-size: 12px; line-height: 18px; text-align: left; cursor: pointer; transition: color 150ms ease, background-color 150ms ease; }
.visual-thinking-panel__header:hover:not(:disabled) { background: rgb(243 244 246 / 60%); color: #111827; }
.visual-thinking-panel__header:disabled { cursor: default; }
.visual-thinking-panel__status { min-width: 0; display: inline-flex; align-items: center; gap: 8px; }
.visual-thinking-panel__spinner { flex: 0 0 14px; width: 14px; height: 14px; border: 1.5px solid #9ca3af; border-right-color: transparent; border-radius: 50%; animation: visual-thinking-spin .85s linear infinite; }
.visual-thinking-panel__done { flex: 0 0 14px; width: 14px; height: 14px; font-size: 14px; color: #9ca3af; }
.visual-thinking-panel__chevron { flex: 0 0 14px; width: 14px; height: 14px; font-size: 14px; color: #9ca3af; transition: transform 200ms ease; }
.visual-thinking-panel__chevron.is-folded { transform: rotate(-90deg); }
.visual-thinking-panel__body { margin-top: 10px; padding: 4px 0 2px 4px; }
.visual-thinking-panel__content { max-height: 240px; overflow-y: auto; color: #6b7280; font-size: 12.5px; line-height: 1.625; white-space: pre-wrap; word-break: break-word; scrollbar-width: thin; }
@keyframes visual-thinking-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .visual-thinking-panel__spinner { animation: none; } .visual-thinking-panel__header,.visual-thinking-panel__chevron { transition: none !important; } }
</style>
