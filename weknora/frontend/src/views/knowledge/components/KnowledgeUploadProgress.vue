<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ tasks: Array<{
  id: number
  fileName: string
  status: 'waiting' | 'uploading' | 'success' | 'error'
  progress: number
  error: string
}> }>()
defineEmits<{ dismiss: [] }>()
const { t } = useI18n()
const uploaded = computed(() => props.tasks.filter(task => task.status === 'success').length)
const failed = computed(() => props.tasks.filter(task => task.status === 'error').length)
const remaining = computed(() => props.tasks.length - uploaded.value - failed.value)
const active = computed(() => props.tasks.find(task => task.status === 'uploading'))
</script>

<template>
  <section v-if="tasks.length" class="knowledge-upload-progress" role="region" :aria-label="t('knowledgeBase.uploadProgress.title')">
    <div class="knowledge-upload-progress__heading">
      <div role="status" aria-live="polite">
        <strong>{{ t('knowledgeBase.uploadProgress.summary', { total: tasks.length, uploaded, failed, remaining }) }}</strong>
        <p v-if="active">{{ t('knowledgeBase.uploadProgress.current', { name: active.fileName, progress: active.progress }) }}</p>
        <p>{{ t(remaining ? 'knowledgeBase.uploadProgress.keepOpen' : 'knowledgeBase.uploadProgress.finished') }}</p>
      </div>
      <button v-if="!remaining" type="button" @click="$emit('dismiss')">{{ t('common.close') }}</button>
    </div>
    <progress :value="uploaded + failed" :max="tasks.length" :aria-label="t('knowledgeBase.uploadProgress.title')" />
    <details :open="failed > 0">
      <summary>{{ t('knowledgeBase.uploadProgress.details') }}</summary>
      <ul>
        <li v-for="task in tasks" :key="task.id" :class="{ 'is-error': task.status === 'error' }">
          <span class="knowledge-upload-progress__name">{{ task.fileName }}</span>
          <span>{{ task.error || t(`knowledgeBase.uploadProgress.${task.status}`) }}</span>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.knowledge-upload-progress { flex: none; margin: 0 0 16px; padding: 14px 16px; border: 1px solid var(--td-component-border); border-radius: 8px; background: var(--td-bg-color-container); color: var(--td-text-color-primary); font-size: 12px; }
.knowledge-upload-progress__heading { display: flex; justify-content: space-between; gap: 16px; }
.knowledge-upload-progress strong { font-size: 13px; }
.knowledge-upload-progress p { margin: 5px 0 0; color: var(--td-text-color-secondary); overflow-wrap: anywhere; }
.knowledge-upload-progress button { align-self: flex-start; border: 0; background: transparent; color: var(--td-text-color-secondary); font: inherit; cursor: pointer; }
.knowledge-upload-progress progress { width: 100%; height: 6px; margin: 10px 0; accent-color: var(--td-brand-color); }
.knowledge-upload-progress summary { cursor: pointer; color: var(--td-text-color-secondary); }
.knowledge-upload-progress ul { list-style: none; padding: 0; margin: 8px 0 0; max-height: 180px; overflow: auto; }
.knowledge-upload-progress li { display: flex; justify-content: space-between; gap: 16px; padding: 5px 0; }
.knowledge-upload-progress__name { min-width: 0; overflow-wrap: anywhere; }
.knowledge-upload-progress .is-error { color: var(--td-error-color); }
</style>
