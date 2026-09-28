<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface KnowledgeItem {
  id: string;
  file_name?: string;
  title?: string;
  type?: string;
  parse_status?: string;
}

const props = defineProps<{
  item: KnowledgeItem;
  canDownload?: boolean;
  canMutateKnowledge: boolean;
  traceVisible: boolean;
  /** Whether the knowledge base has a folder structure to file documents into. */
  foldersAvailable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'download'): void;
  (e: 'edit'): void;
  (e: 'view-trace'): void;
  (e: 'reparse'): void;
  (e: 'cancel-parse'): void;
  (e: 'move'): void;
  (e: 'move-folder'): void;
  (e: 'batch-manage'): void;
  (e: 'delete'): void;
}>();

const { t } = useI18n();

const CANCELABLE_PARSE_STATUSES = new Set(['pending', 'processing', 'finalizing']);

const isParseInFlight = computed(() =>
  CANCELABLE_PARSE_STATUSES.has(String(props.item.parse_status ?? ''))
);

const fileName = computed(() => props.item.file_name || props.item.title || props.item.id);
</script>

<template>
  <div class="visual-document-actions">
    <button v-if="canDownload && (item.type === 'file' || item.type === 'manual')" type="button" class="visual-document-actions__item" @click.stop="emit('download')">
      <t-icon name="download" />
      <span>{{ $t('common.download') }}</span>
    </button>

    <button v-if="item.type === 'manual'" type="button" class="visual-document-actions__item" @click.stop="emit('edit')">
      <t-icon name="edit" />
      <span>{{ $t('knowledgeBase.editDocument') }}</span>
    </button>

    <button v-if="traceVisible" type="button" class="visual-document-actions__item" @click.stop="emit('view-trace')">
      <t-icon name="chart-bar" />
      <span>{{ $t('knowledgeStages.viewTrace') }}</span>
    </button>

    <button v-if="isParseInFlight" type="button" class="visual-document-actions__item" @click.stop="emit('reparse')">
      <t-icon name="refresh" />
      <span>{{ $t('knowledgeBase.rebuildDocument') }}</span>
    </button>

    <t-popconfirm
      v-else
      theme="warning"
      :content="$t('knowledgeBase.rebuildConfirm', { fileName })"
      :confirm-btn="{ content: $t('common.confirm'), theme: 'primary' }"
      :cancel-btn="{ content: $t('common.cancel') }"
      placement="left"
      @confirm="emit('reparse')"
    >
      <button type="button" class="visual-document-actions__item" @click.stop>
        <t-icon name="refresh" />
        <span>{{ $t('knowledgeBase.rebuildDocument') }}</span>
      </button>
    </t-popconfirm>

    <t-popconfirm
      v-if="isParseInFlight"
      theme="warning"
      :content="$t('knowledgeBase.cancelParseConfirmBody', { title: fileName })"
      :confirm-btn="{ content: $t('knowledgeBase.cancelParse'), theme: 'danger' }"
      :cancel-btn="{ content: $t('common.cancel') }"
      placement="left"
      @confirm="emit('cancel-parse')"
    >
      <button type="button" class="visual-document-actions__item is-danger" @click.stop>
        <t-icon name="close-circle" />
        <span>{{ $t('knowledgeBase.cancelParse') }}</span>
      </button>
    </t-popconfirm>

    <button v-if="canMutateKnowledge" type="button" class="visual-document-actions__item" @click.stop="emit('move-folder')">
      <t-icon name="folder" />
      <span>{{ $t('knowledgeBase.moveToFolder.action') }}</span>
    </button>

    <button v-if="canMutateKnowledge" type="button" class="visual-document-actions__item" @click.stop="emit('move')">
      <t-icon name="swap" />
      <span>{{ $t('knowledgeBase.moveDocument') }}</span>
    </button>

    <button v-if="canMutateKnowledge" type="button" class="visual-document-actions__item" @click.stop="emit('batch-manage')">
      <t-icon name="queue" />
      <span>{{ $t('menu.batchManage') }}</span>
    </button>

    <t-popconfirm
      theme="warning"
      :content="$t('knowledgeBase.confirmDeleteDocument', { fileName })"
      :confirm-btn="{ content: $t('knowledgeBase.confirmDelete'), theme: 'danger' }"
      :cancel-btn="{ content: $t('common.cancel') }"
      placement="left"
      @confirm="emit('delete')"
    >
      <button type="button" class="visual-document-actions__item is-danger" @click.stop>
        <t-icon name="delete" />
        <span>{{ $t('knowledgeBase.deleteDocument') }}</span>
      </button>
    </t-popconfirm>
  </div>
</template>

<style scoped lang="less">
.visual-document-actions {
  min-width: 180px;
  padding: 5px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.visual-document-actions__item {
  position: relative;
  width: 100%;
  min-height: 34px;
  padding: 7px 9px;
  box-sizing: border-box;
  border: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, transform 100ms ease;
}

.visual-document-actions__item:hover {
  background: #f3f4f6;
  color: #111827;
}

.visual-document-actions__item:active {
  transform: scale(.985);
}

.visual-document-actions__item :deep(.t-icon) {
  flex: 0 0 15px;
  width: 15px;
  height: 15px;
  font-size: 15px;
  color: #6b7280;
}

.visual-document-actions__item:hover :deep(.t-icon) {
  color: #374151;
}

.visual-document-actions__item.is-danger {
  margin-top: 5px;
  color: #b91c1c;
}

.visual-document-actions__item.is-danger::before {
  content: '';
  position: absolute;
  top: -3px;
  right: 8px;
  left: 8px;
  height: 1px;
  background: #f3f4f6;
}

.visual-document-actions__item.is-danger :deep(.t-icon) {
  color: #b91c1c;
}

.visual-document-actions__item.is-danger:hover {
  background: #fef2f2;
  color: #991b1b;
}
</style>
