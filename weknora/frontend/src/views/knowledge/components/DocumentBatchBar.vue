<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FolderPickerMenu, { type FolderOption } from './FolderPickerMenu.vue'

const props = defineProps<{
  count: number
  deleteLoading?: boolean
  reparseLoading?: boolean
  tagLoading?: boolean
  cancelParseLoading?: boolean
  cancelParseCount?: number
  visible?: boolean
  showMoveToFolder?: boolean
  folderOptions?: FolderOption[]
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'delete'): void
  (e: 'reparse'): void
  (e: 'cancelParse'): void
  (e: 'batchTag'): void
  (e: 'moveToFolder', folderPath: string): void
}>()

const { t } = useI18n()
const folderPickerVisible = ref(false)

const actionsDisabled = computed(() =>
  props.count === 0 || !!props.deleteLoading || !!props.reparseLoading || !!props.tagLoading || !!props.cancelParseLoading,
)

const handleFolderConfirm = (path: string) => {
  if (actionsDisabled.value) return
  folderPickerVisible.value = false
  emit('moveToFolder', path)
}
</script>

<template>
  <Transition name="visual-document-batch">
    <aside
      v-if="visible || count > 0"
      class="visual-document-batch"
      role="region"
      :aria-label="t('knowledgeBase.selectedCount', { count })"
    >
      <div class="visual-document-batch__summary">
        <span class="visual-document-batch__count">
          {{ t('knowledgeBase.selectedCount', { count }) }}
        </span>
        <button type="button" class="visual-document-batch__clear" @click="emit('cancel')">
          {{ t('knowledgeBase.clearSelection') }}
        </button>
      </div>

      <div class="visual-document-batch__actions">
        <t-popconfirm
          theme="warning"
          :content="t('knowledgeBase.batchCancelParseConfirm', { count: cancelParseCount || 0 })"
          :confirm-btn="{ content: t('knowledgeBase.cancelParse'), theme: 'warning' }"
          :cancel-btn="{ content: t('common.cancel') }"
          placement="top"
          @confirm="emit('cancelParse')"
        >
          <button
            type="button"
            class="visual-document-batch__button"
            :disabled="actionsDisabled || !cancelParseCount"
            @click.stop
          >
            <t-loading v-if="cancelParseLoading" size="small" />
            <t-icon v-else name="stop-circle" />
            <span>{{ t('knowledgeBase.cancelParse') }}</span>
          </button>
        </t-popconfirm>

        <t-popconfirm
          theme="warning"
          :content="t('knowledgeBase.confirmBatchReparseDocument', { count })"
          :confirm-btn="{ content: t('knowledgeBase.confirmBatchReparse'), theme: 'warning' }"
          :cancel-btn="{ content: t('common.cancel') }"
          placement="top"
          @confirm="emit('reparse')"
        >
          <button
            type="button"
            class="visual-document-batch__button"
            :disabled="actionsDisabled"
            @click.stop
          >
            <t-loading v-if="reparseLoading" size="small" />
            <t-icon v-else name="refresh" />
            <span>{{ t('knowledgeBase.rebuildDocument') }}</span>
          </button>
        </t-popconfirm>

        <button
          type="button"
          class="visual-document-batch__button"
          :disabled="actionsDisabled"
          @click="emit('batchTag')"
        >
          <t-loading v-if="tagLoading" size="small" />
          <t-icon v-else name="discount" />
          <span>{{ t('knowledgeBase.batchTag') }}</span>
        </button>

        <t-popup
          v-if="showMoveToFolder"
          v-model:visible="folderPickerVisible"
          trigger="click"
          placement="top"
          destroy-on-close
          :overlay-inner-style="{
            padding: 0,
            border: '0',
            borderRadius: 0,
            background: 'transparent',
            boxShadow: 'none',
          }"
        >
          <button
            type="button"
            class="visual-document-batch__button"
            :disabled="actionsDisabled"
          >
            <t-icon name="folder" />
            <span>{{ t('knowledgeBase.moveToFolder.action') }}</span>
          </button>
          <template #content>
            <FolderPickerMenu
              :options="folderOptions || []"
              @confirm="handleFolderConfirm"
            />
          </template>
        </t-popup>

        <t-popconfirm
          theme="warning"
          :content="t('knowledgeBase.confirmBatchDeleteDocument', { count })"
          :confirm-btn="{ content: t('knowledgeBase.confirmDelete'), theme: 'danger' }"
          :cancel-btn="{ content: t('common.cancel') }"
          placement="top"
          @confirm="emit('delete')"
        >
          <button
            type="button"
            class="visual-document-batch__button is-danger"
            :disabled="actionsDisabled"
            @click.stop
          >
            <t-loading v-if="deleteLoading" size="small" />
            <t-icon v-else name="delete" />
            <span>{{ t('knowledgeBase.batchDelete') }}</span>
          </button>
        </t-popconfirm>
      </div>
    </aside>
  </Transition>
</template>

<style scoped lang="less">
.visual-document-batch {
  position: relative;
  z-index: 5;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0 auto;
  padding: 6px 8px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 10px 28px rgb(15 23 42 / 10%);
  backdrop-filter: blur(12px);
}

.visual-document-batch__summary {
  min-width: 0;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.visual-document-batch__count {
  color: #374151;
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
  white-space: nowrap;
}

.visual-document-batch__clear {
  padding: 3px 5px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  cursor: pointer;
}

.visual-document-batch__clear:hover {
  background: #f3f4f6;
  color: #4b5563;
}

.visual-document-batch__actions {
  min-width: 0;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  flex-wrap: nowrap;
}

.visual-document-batch__button {
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #fff;
  color: #4b5563;
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 100ms ease;
}

.visual-document-batch__button:hover:not(:disabled) {
  border-color: #d1d5db;
  background: #f9fafb;
  color: #111827;
}

.visual-document-batch__button:active:not(:disabled) {
  transform: scale(.98);
}

.visual-document-batch__button:disabled {
  cursor: default;
  opacity: .45;
}

.visual-document-batch__button.is-danger {
  border-color: #fecaca;
  color: #dc2626;
}

.visual-document-batch__button.is-danger:hover:not(:disabled) {
  border-color: #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
}

.visual-document-batch__button :deep(.t-icon),
.visual-document-batch__button :deep(.t-loading) {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  font-size: 14px;
}

.visual-document-batch-enter-active,
.visual-document-batch-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.visual-document-batch-enter-from,
.visual-document-batch-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .visual-document-batch-enter-active,
  .visual-document-batch-leave-active,
  .visual-document-batch__button {
    transition: none !important;
  }
}
</style>
