<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ delete: [] }>()
const { t } = useI18n()
const visible = ref(false)
const remove = () => {
  visible.value = false
  emit('delete')
}
</script>

<template>
  <span class="visual-folder-actions" @click.stop @keydown.stop @mousedown.stop>
    <t-popup v-model:visible="visible" trigger="click" placement="bottom-right" destroy-on-close overlay-class-name="card-more-popup">
      <button type="button" class="visual-folder-actions__trigger" :aria-label="t('knowledgeBase.moreOptions')">
        <t-icon name="more" />
      </button>
      <template #content>
        <button type="button" class="visual-folder-actions__delete" @click.stop="remove">
          <t-icon name="delete" />{{ t('knowledgeBase.folderTree.deleteFolder') }}
        </button>
      </template>
    </t-popup>
  </span>
</template>

<style scoped>
.visual-folder-actions { display: inline-flex; }
.visual-folder-actions__trigger { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-folder-actions__trigger:hover { background: #f3f4f6; color: #374151; }
.visual-folder-actions__delete { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: 0; border-radius: 6px; background: transparent; color: #d54941; font: inherit; cursor: pointer; white-space: nowrap; }
.visual-folder-actions__delete:hover { background: #fff0ed; }
</style>
