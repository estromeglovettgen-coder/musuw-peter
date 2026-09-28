<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatFileSize, getFileIcon } from '@/utils/files';
import { useTagChipsOverflow } from '@/composables/useTagChipsOverflow';
import DocumentActionMenu from './DocumentActionMenu.vue';
import FolderActionMenu from './FolderActionMenu.vue';
import FolderPickerMenu, { type FolderOption } from './FolderPickerMenu.vue';

interface Tag {
  id: string;
  name: string;
  color?: string;
}

interface KnowledgeItem {
  id: string;
  file_name: string;
  folder_path?: string;
  file_type?: string;
  file_size?: number | string;
  type?: string;
  tags?: Tag[];
  parse_status?: string;
  summary_status?: string;
  updated_at?: string;
  source?: string;
  description?: string;
  error_message?: string;
  channel?: string;
  isMore?: boolean;
}

const props = defineProps<{
  items: KnowledgeItem[];
  selectedIds: Set<string>;
  canEdit: boolean;
  canDownload: boolean;
  canMutateKnowledge: boolean;
  traceVisibleIds: Record<string, boolean>;
  tagList: Tag[];
  loading?: boolean;
  /** Sub-folders of the folder currently being browsed. */
  folders?: Array<{ path: string; name: string; total_count: number }>;
  /** Every folder of the knowledge base, for the "move to folder" picker. */
  folderOptions?: FolderOption[];
  /**
   * Show each row's folder under its name. Only useful when the list spans
   * several folders, i.e. while filtering; inside one folder the path would be
   * identical on every row.
   */
  showFolderPath?: boolean;
  // Move sub-flow state
  moveMenuMode: 'normal' | 'targets' | 'confirm';
  moveTargetKbs: any[];
  moveTargetsLoading: boolean;
  moveSelectedTargetName: string;
  moveMode: 'reuse_vectors' | 'reparse';
  moveSubmitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', item: KnowledgeItem): void;
  (e: 'toggle-row', id: string, checked: boolean, shiftKey: boolean): void;
  (e: 'toggle-all', checked: boolean): void;
  (e: 'action', action: 'download' | 'edit' | 'reparse' | 'cancel-parse' | 'move' | 'move-folder' | 'delete' | 'view-trace' | 'batch-manage', item: KnowledgeItem): void;
  (e: 'probe-trace', item: KnowledgeItem): void;
  (e: 'tag-edit', item: KnowledgeItem): void;
  (e: 'open-folder', path: string): void;
  (e: 'delete-folder', path: string): void;
  (e: 'move-to-folder', item: KnowledgeItem, folderPath: string): void;
  // Move sub-flow emits
  (e: 'move-select-target', kb: any): void;
  (e: 'move-back'): void;
  (e: 'move-confirm'): void;
  (e: 'update:moveMode', mode: 'reuse_vectors' | 'reparse'): void;
  (e: 'reset-move-state'): void;
}>();

const { t } = useI18n();

const {
  setupTagChipsObserver,
  getTagLimit,
  hasTagOverflow,
  getOverflowCount,
} = useTagChipsOverflow('listTagItemId');

const tagMap = computed(() => {
  const map: Record<string, Tag> = {};
  for (const tag of props.tagList) map[String(tag.id)] = tag;
  return map;
});
const getTagName = (tagId?: string | number) => {
  if (!tagId && tagId !== 0) return '';
  return tagMap.value[String(tagId)]?.name || '';
};

const formatTime = (time?: string) => {
  if (!time) return '--';
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return '--';
  const yy = String(d.getFullYear()).slice(2);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yy}-${MM}-${dd} ${hh}:${mm}`;
};

const getSourceInfo = (item: KnowledgeItem): { icon: string; label: string } => {
  const ch = item.channel;
  if (ch === 'feishu') return { icon: 'cloud-download', label: t('knowledgeBase.channelFeishu') };
  // Drive (云盘) connectors use their own channel so Drive docs show
  // "飞书云盘" / "Lark 云盘", distinct from the wiki connector's "飞书".
  if (ch === 'feishu_drive') return { icon: 'cloud-download', label: t('knowledgeBase.channelFeishuDrive') };
  if (ch === 'lark_drive') return { icon: 'cloud-download', label: t('knowledgeBase.channelLarkDrive') };
  if (ch === 'notion') return { icon: 'cloud-download', label: t('knowledgeBase.channelNotion') };
  if (ch === 'yuque') return { icon: 'cloud-download', label: t('knowledgeBase.channelYuque') };
  if (ch === 'gitlab') return { icon: 'cloud-download', label: t('knowledgeBase.channelGitLab') };
  if (ch === 'ima') return { icon: 'cloud-download', label: t('knowledgeBase.channelIma') };
  if (ch === 'wechat') return { icon: 'cloud-download', label: t('knowledgeBase.channelWechat') };
  if (ch === 'wecom') return { icon: 'cloud-download', label: t('knowledgeBase.channelWecom') };
  if (ch === 'dingtalk') return { icon: 'cloud-download', label: t('knowledgeBase.channelDingtalk') };
  if (ch === 'slack') return { icon: 'cloud-download', label: t('knowledgeBase.channelSlack') };
  if (ch === 'im') return { icon: 'cloud-download', label: t('knowledgeBase.channelIm') };
  if (item.type === 'url') return { icon: 'link', label: t('knowledgeBase.channelUrl') };
  if (item.type === 'manual') return { icon: 'edit', label: t('knowledgeBase.channelManual') };
  return { icon: 'upload', label: t('knowledgeBase.channelUpload') };
};

interface StatusInfo {
  label: string;
  theme: 'success' | 'warning' | 'danger' | 'primary' | 'default';
  icon?: string;
  spin?: boolean;
}
const computeStatus = (item: KnowledgeItem): StatusInfo => {
  if (item.parse_status === 'pending' || item.parse_status === 'processing') {
    return { label: t('knowledgeBase.statusProcessing'), theme: 'primary', icon: 'loading', spin: true };
  }
  // finalizing = primary parse done, enrichment subtasks still running.
  // While in this phase, prefer the specific "summary generating" copy
  // when summary is what's actually outstanding (preserves the old UX
  // where this label was tied to completed+summary_pending). Otherwise
  // fall back to the generic "finalizing" label — covers question gen
  // and graph extract, which the user historically had no visibility on.
  if (item.parse_status === 'finalizing') {
    if (item.summary_status === 'pending' || item.summary_status === 'processing') {
      return { label: t('knowledgeBase.generatingSummary'), theme: 'primary', icon: 'loading', spin: true };
    }
    return { label: t('knowledgeBase.statusFinalizing'), theme: 'primary', icon: 'loading', spin: true };
  }
  if (item.parse_status === 'failed') {
    return { label: item.error_message || t('knowledgeBase.statusFailed'), theme: 'danger', icon: 'close-circle' };
  }
  if (item.parse_status === 'cancelled') {
    return { label: t('knowledgeBase.statusCancelled'), theme: 'warning', icon: 'close-circle' };
  }
  if (item.parse_status === 'draft') {
    return { label: t('knowledgeBase.statusDraft'), theme: 'warning' };
  }
  // Legacy completed+summary_pending path: kept as a defensive fallback
  // for rows that bypassed finalizing (no enrichment configured, or
  // upgraded mid-flight from a pre-finalizing build).
  if (
    item.parse_status === 'completed' &&
    (item.summary_status === 'pending' || item.summary_status === 'processing')
  ) {
    return { label: t('knowledgeBase.generatingSummary'), theme: 'primary', icon: 'loading', spin: true };
  }
  if (item.parse_status === 'completed') {
    return { label: t('knowledgeBase.statusCompleted'), theme: 'success' };
  }
  return { label: '--', theme: 'default' };
};

const statusByRow = computed(() => {
  const map = new Map<string, StatusInfo>();
  for (const item of props.items) map.set(item.id, computeStatus(item));
  return map;
});

const allSelected = computed(() => {
  return props.items.length > 0 && props.items.every(i => props.selectedIds.has(i.id));
});
const someSelected = computed(() => {
  return props.items.some(i => props.selectedIds.has(i.id)) && !allSelected.value;
});

const onHeaderCheckboxChange = (checked: boolean) => {
  emit('toggle-all', checked);
};

const onRowCheckboxChange = (item: KnowledgeItem, checked: boolean, ctx?: { e?: Event }) => {
  const me = ctx?.e as MouseEvent | undefined;
  emit('toggle-row', item.id, checked, !!me?.shiftKey);
};

const moreOpen = ref<string | null>(null);
const onMoreVisible = (id: string, visible: boolean) => {
  moreOpen.value = visible ? id : null;
  if (visible) {
    const it = props.items.find(i => i.id === id);
    if (it) emit('probe-trace', it);
  } else {
    folderPickerItemId.value = null;
    // Reset move state when popup closes naturally
    emit('reset-move-state');
  }
};

// 吸顶检测：哨兵离开视口说明 header 已吸附在滚动容器顶部
const stickySentinel = ref<HTMLElement | null>(null);
const headerStuck = ref(false);
let stickyObserver: IntersectionObserver | null = null;
onMounted(() => {
  if (!stickySentinel.value || typeof IntersectionObserver === 'undefined') return;
  stickyObserver = new IntersectionObserver(
    (entries) => {
      headerStuck.value = !entries[0].isIntersecting;
    },
    { threshold: 0 },
  );
  stickyObserver.observe(stickySentinel.value);
});
onBeforeUnmount(() => {
  stickyObserver?.disconnect();
  stickyObserver = null;
});

// Which row's action popup is currently showing the folder picker. Kept local so
// picking a folder stays inside the menu the user already opened, exactly like
// the "move to knowledge base" sub-menu next to it.
const folderPickerItemId = ref<string | null>(null);

const onFolderPicked = (item: KnowledgeItem, path: string) => {
  folderPickerItemId.value = null;
  moreOpen.value = null;
  item.isMore = false;
  emit('move-to-folder', item, path);
};

const handleAction = (action: 'download' | 'edit' | 'reparse' | 'cancel-parse' | 'move' | 'move-folder' | 'delete' | 'view-trace' | 'batch-manage', item: KnowledgeItem) => {
  // The folder picker opens inside this same popup, so keep the menu open.
  if (action === 'move-folder') {
    folderPickerItemId.value = item.id;
    return;
  }
  // Don't close popup for move — it triggers the move sub-flow
  if (action !== 'move') {
    moreOpen.value = null;
  }
  item.isMore = false;
  emit('action', action, item);
};

</script>

<template>
  <div class="visual-document-list" :class="{ 'is-loading': loading }">
    <div ref="stickySentinel" class="visual-document-list__sentinel" aria-hidden="true" />

    <div class="visual-document-list__header" :class="{ 'is-stuck': headerStuck }" role="row">
      <div class="visual-document-list__cell is-check" role="columnheader" @click.stop>
        <t-checkbox
          class="visual-document-list__check"
          size="small"
          :checked="allSelected"
          :indeterminate="someSelected"
          :disabled="!items.length"
          :title="t('knowledgeBase.selectAll')"
          @change="onHeaderCheckboxChange"
        />
      </div>
      <div class="visual-document-list__cell is-name" role="columnheader">{{ t('knowledgeBase.columnName') }}</div>
      <div class="visual-document-list__cell is-tag" role="columnheader">{{ t('knowledgeBase.columnTag') }}</div>
      <div class="visual-document-list__cell is-source" role="columnheader">{{ t('knowledgeBase.columnSource') }}</div>
      <div class="visual-document-list__cell is-size" role="columnheader">{{ t('knowledgeBase.columnSize') }}</div>
      <div class="visual-document-list__cell is-status" role="columnheader">{{ t('knowledgeBase.columnStatus') }}</div>
      <div class="visual-document-list__cell is-time" role="columnheader">{{ t('knowledgeBase.columnUpdatedAt') }}</div>
      <div v-if="canEdit" class="visual-document-list__cell is-actions" role="columnheader" />
    </div>

    <div class="visual-document-list__body">
      <div
        v-for="folder in folders"
        :key="'folder-' + folder.path"
        tabindex="0"
        class="visual-document-list__row is-folder"
        :title="folder.path"
        role="row"
        @click="emit('open-folder', folder.path)"
        @keydown.enter.self="emit('open-folder', folder.path)"
        @keydown.space.prevent.self="emit('open-folder', folder.path)"
      >
        <span class="visual-document-list__cell is-check" aria-hidden="true" />
        <span class="visual-document-list__cell is-name">
          <span class="visual-document-list__file-icon is-folder"><t-icon name="folder" /></span>
          <span class="visual-document-list__file-copy">
            <strong>{{ folder.name }}</strong>
          </span>
        </span>
        <span class="visual-document-list__cell is-tag" />
        <span class="visual-document-list__cell is-source">
          <span class="visual-document-list__folder-count">
            {{ t('knowledgeBase.folderTree.folderCardCount', { count: folder.total_count }) }}
          </span>
        </span>
        <span class="visual-document-list__cell is-size" />
        <span class="visual-document-list__cell is-status" />
        <span class="visual-document-list__cell is-time" />
        <span v-if="canEdit" class="visual-document-list__cell is-actions">
          <FolderActionMenu v-if="canMutateKnowledge" @delete="emit('delete-folder', folder.path)" />
        </span>
      </div>

      <div
        v-for="item in items"
        :key="item.id"
        class="visual-document-list__row"
        :class="{ 'is-selected': selectedIds.has(item.id), 'is-menu-open': moreOpen === item.id }"
        :data-select-id="item.id"
        role="row"
        tabindex="0"
        @click="emit('open', item)"
        @keydown.enter="emit('open', item)"
      >
        <div class="visual-document-list__cell is-check" @click.stop>
          <t-checkbox
            class="visual-document-list__check"
            size="small"
            :checked="selectedIds.has(item.id)"
            :title="item.file_name"
            @change="(c: boolean, ctx?: { e?: Event }) => onRowCheckboxChange(item, c, ctx)"
          />
        </div>

        <div class="visual-document-list__cell is-name">
          <span class="visual-document-list__file-icon">
            <t-icon :name="getFileIcon(item)" />
          </span>
          <span class="visual-document-list__file-copy">
            <strong :title="item.file_name">{{ item.file_name }}</strong>
            <button
              v-if="showFolderPath && item.folder_path"
              type="button"
              class="visual-document-list__folder-path"
              :title="item.folder_path"
              @click.stop="emit('open-folder', item.folder_path)"
            >
              <t-icon name="folder" />
              <span>{{ item.folder_path }}</span>
            </button>
            <small v-if="item.description" :title="item.description">{{ item.description }}</small>
          </span>
        </div>

        <div class="visual-document-list__cell is-tag" @click.stop>
          <template v-if="item.tags && item.tags.length > 0">
            <t-tooltip
              v-if="hasTagOverflow(item.id, (item.tags || []).length)"
              :content="(item.tags || []).map((tag: any) => tag.name).join(', ')"
              placement="top"
            >
              <div
                class="visual-document-list__tags"
                :ref="(el: any) => setupTagChipsObserver(el, item.id, (item.tags || []).length)"
                :class="{ 'is-clickable': canEdit }"
                @click="canEdit && emit('tag-edit', item)"
              >
                <span v-for="tag in (item.tags || []).slice(0, getTagLimit(item.id))" :key="tag.id" class="visual-document-list__tag">
                  {{ tag.name }}
                </span>
                <span class="visual-document-list__tag-overflow">+{{ getOverflowCount(item.id, (item.tags || []).length) }}</span>
              </div>
            </t-tooltip>
            <div
              v-else
              class="visual-document-list__tags"
              :ref="(el: any) => setupTagChipsObserver(el, item.id, (item.tags || []).length)"
              :class="{ 'is-clickable': canEdit }"
              @click="canEdit && emit('tag-edit', item)"
            >
              <span v-for="tag in (item.tags || []).slice(0, getTagLimit(item.id))" :key="tag.id" class="visual-document-list__tag">
                {{ tag.name }}
              </span>
            </div>
          </template>
          <button v-else-if="canEdit" type="button" class="visual-document-list__add-tag" @click="emit('tag-edit', item)">
            + {{ t('knowledgeBase.tagLabel') }}
          </button>
        </div>

        <div class="visual-document-list__cell is-source">
          <t-icon class="visual-document-list__source-icon" :name="getSourceInfo(item).icon" />
          <span class="visual-document-list__source-label">{{ getSourceInfo(item).label }}</span>
        </div>

        <div class="visual-document-list__cell is-size">
          <span class="visual-document-list__mono">{{ formatFileSize(item.file_size) || '--' }}</span>
        </div>

        <div class="visual-document-list__cell is-status">
          <template v-if="statusByRow.get(item.id) as StatusInfo | undefined">
            <span
              v-if="statusByRow.get(item.id)!.label !== '--'"
              class="visual-document-list__status"
              :class="`is-${statusByRow.get(item.id)!.theme}`"
              :title="statusByRow.get(item.id)!.label"
            >
              <t-icon
                v-if="statusByRow.get(item.id)!.icon"
                :name="statusByRow.get(item.id)!.icon!"
                :class="{ 'is-spinning': statusByRow.get(item.id)!.spin }"
              />
              {{ statusByRow.get(item.id)!.label }}
            </span>
            <span v-else class="visual-document-list__muted">--</span>
          </template>
        </div>

        <div class="visual-document-list__cell is-time">
          <span class="visual-document-list__mono">{{ formatTime(item.updated_at) }}</span>
        </div>

        <div v-if="canEdit" class="visual-document-list__cell is-actions" @click.stop>
          <t-popup
            placement="bottom-right"
            trigger="click"
            destroy-on-close
            overlay-class-name="card-more"
            :on-visible-change="(v: boolean) => onMoreVisible(item.id, v)"
          >
            <button
              class="visual-document-list__more"
              :class="{ 'is-active': moreOpen === item.id }"
              type="button"
              :aria-label="t('knowledgeBase.columnActions')"
            >
              <t-icon name="more" size="16px" />
            </button>
            <template #content>
              <div v-if="folderPickerItemId === item.id" class="visual-list-menu visual-list-menu--move">
                <FolderPickerMenu
                  :options="folderOptions || []"
                  :current-path="item.folder_path || ''"
                  show-back
                  @back="folderPickerItemId = null"
                  @confirm="(path: string) => onFolderPicked(item, path)"
                />
              </div>

              <div v-else-if="moveMenuMode === 'normal'" class="visual-list-menu">
                <DocumentActionMenu
                  :item="item"
                  :can-download="canDownload"
                  :can-mutate-knowledge="canMutateKnowledge"
                  :trace-visible="!!traceVisibleIds[item.id] || (item.parse_status === 'pending' || item.parse_status === 'processing' || item.parse_status === 'finalizing')"
                  @download="handleAction('download', item)"
                  @edit="handleAction('edit', item)"
                  @view-trace="handleAction('view-trace', item)"
                  @reparse="handleAction('reparse', item)"
                  @cancel-parse="handleAction('cancel-parse', item)"
                  @move="handleAction('move', item)"
                  @move-folder="handleAction('move-folder', item)"
                  @batch-manage="handleAction('batch-manage', item)"
                  @delete="handleAction('delete', item)"
                />
              </div>

              <div v-else-if="moveMenuMode === 'targets'" class="visual-list-menu visual-list-menu--move">
                <button type="button" class="visual-list-menu__back" @click.stop="emit('move-back')">
                  <t-icon name="chevron-left" size="16px" />
                  <span>{{ $t('knowledgeBase.moveToKnowledgeBase') }}</span>
                </button>
                <div class="visual-list-menu__targets">
                  <div v-if="moveTargetsLoading" class="visual-list-menu__state"><t-loading size="small" /></div>
                  <div v-else-if="moveTargetKbs.length === 0" class="visual-list-menu__state">
                    {{ $t('knowledgeBase.moveNoTargets') }}
                  </div>
                  <template v-else>
                    <button
                      v-for="kb in moveTargetKbs"
                      :key="kb.id"
                      type="button"
                      class="visual-list-menu__target"
                      @click.stop="emit('move-select-target', kb)"
                    >
                      <t-icon name="root-list" />
                      <span class="visual-list-menu__target-name">{{ kb.name }}</span>
                      <small v-if="kb.knowledge_count !== undefined" class="visual-list-menu__target-count">{{ kb.knowledge_count }}</small>
                    </button>
                  </template>
                </div>
              </div>

              <div v-else-if="moveMenuMode === 'confirm'" class="visual-list-menu visual-list-menu--move">
                <button type="button" class="visual-list-menu__back" @click.stop="emit('move-back')">
                  <t-icon name="chevron-left" size="16px" />
                  <span>{{ $t('knowledgeBase.moveConfirmTitle') }}</span>
                </button>
                <div class="visual-list-menu__confirm">
                  <div class="visual-list-menu__destination">
                    <t-icon name="arrow-right" size="14px" />
                    <span class="visual-list-menu__destination-name">{{ moveSelectedTargetName }}</span>
                  </div>
                  <button
                    type="button"
                    class="visual-list-menu__mode"
                    :class="{ 'is-active': moveMode === 'reuse_vectors' }"
                    @click.stop="emit('update:moveMode', 'reuse_vectors')"
                  >
                    <t-radio :checked="moveMode === 'reuse_vectors'" />
                    <span>
                      <strong>{{ $t('knowledgeBase.moveModeReuseVectors') }}</strong>
                      <small>{{ $t('knowledgeBase.moveModeReuseVectorsDesc') }}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="visual-list-menu__mode"
                    :class="{ 'is-active': moveMode === 'reparse' }"
                    @click.stop="emit('update:moveMode', 'reparse')"
                  >
                    <t-radio :checked="moveMode === 'reparse'" />
                    <span>
                      <strong>{{ $t('knowledgeBase.moveModeReparse') }}</strong>
                      <small>{{ $t('knowledgeBase.moveModeReparseDesc') }}</small>
                    </span>
                  </button>
                  <div class="visual-list-menu__actions">
                    <t-button size="small" variant="outline" @click.stop="emit('move-back')">{{ $t('common.cancel') }}</t-button>
                    <t-button size="small" theme="primary" :loading="moveSubmitting" @click.stop="emit('move-confirm')">
                      {{ $t('knowledgeBase.moveConfirm') }}
                    </t-button>
                  </div>
                </div>
              </div>
            </template>
          </t-popup>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.visual-document-list {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  color: #374151;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.visual-document-list__sentinel {
  height: 0;
  pointer-events: none;
}

.visual-document-list__header,
.visual-document-list__row {
  display: grid;
  grid-template-columns:
    40px
    minmax(220px, 2.5fr)
    minmax(96px, .9fr)
    minmax(92px, .8fr)
    84px
    minmax(96px, .8fr)
    126px
    42px;
  align-items: center;
  min-width: 960px;
  padding: 0 14px;
  box-sizing: border-box;
}

.visual-document-list__header {
  position: sticky;
  top: 0;
  z-index: 3;
  min-height: 38px;
  border-bottom: 1px solid #f3f4f6;
  border-radius: 11px 11px 0 0;
  background: #f9fafb;
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
  font-weight: 600;
  transition: border-radius 150ms ease, box-shadow 150ms ease;
}

.visual-document-list__header.is-stuck {
  border-radius: 0;
  box-shadow: 0 4px 10px rgb(0 0 0 / 7%);
}

.visual-document-list__body {
  overflow: hidden;
  border-radius: 0 0 11px 11px;
}

.visual-document-list__row {
  min-height: 58px;
  border: 0;
  border-bottom: 1px solid #f3f4f6;
  background: #fff;
  color: #374151;
  text-align: left;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.visual-document-list__row:last-child { border-bottom: 0; }

.visual-document-list__row:hover,
.visual-document-list__row.is-menu-open {
  background: #f9fafb;
}

.visual-document-list__row.is-selected {
  background: #f3f4f6;
}

.visual-document-list__row.is-folder {
  width: 100%;
}

.visual-document-list__cell {
  min-width: 0;
  padding: 0 7px;
  display: flex;
  align-items: center;
}

.visual-document-list__cell:first-child { padding-left: 0; }
.visual-document-list__cell:last-child { padding-right: 0; }
.visual-document-list__cell.is-check { justify-content: center; padding-inline: 0; }
.visual-document-list__cell.is-name { gap: 9px; }
.visual-document-list__cell.is-size,
.visual-document-list__cell.is-time,
.visual-document-list__cell.is-actions { justify-content: flex-end; }
.visual-document-list__cell.is-source { gap: 5px; }

.visual-document-list__check {
  margin: 0;
}

.visual-document-list__check :deep(.t-checkbox__label) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

.visual-document-list__file-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
}

.visual-document-list__file-icon.is-folder {
  color: #2563eb;
}

.visual-document-list__file-icon :deep(.t-icon) { font-size: 15px; }

.visual-document-list__file-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.visual-document-list__file-copy strong,
.visual-document-list__file-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-document-list__file-copy strong {
  color: #111827;
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
}

.visual-document-list__file-copy small {
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
}

.visual-document-list__folder-path {
  align-self: flex-start;
  max-width: 100%;
  padding: 0;
  border: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 10px;
  line-height: 14px;
  cursor: pointer;
}

.visual-document-list__folder-path:hover { color: #4b5563; }
.visual-document-list__folder-path span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-document-list__folder-path :deep(.t-icon) { flex: 0 0 auto; font-size: 11px; }

.visual-document-list__tags {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
}

.visual-document-list__tags.is-clickable { cursor: pointer; }

.visual-document-list__tag,
.visual-document-list__tag-overflow {
  flex: 0 0 auto;
  max-width: 96px;
  padding: 1px 5px;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #fff7ed;
  color: #c2410c;
  font-size: 9px;
  line-height: 14px;
  font-weight: 600;
}

.visual-document-list__tag-overflow {
  border-color: #e5e7eb;
  background: #f9fafb;
  color: #6b7280;
}

.visual-document-list__add-tag {
  padding: 1px 5px;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 9px;
  line-height: 14px;
  cursor: pointer;
}

.visual-document-list__source-icon {
  flex: 0 0 13px;
  font-size: 13px;
  color: #9ca3af;
}

.visual-document-list__source-label,
.visual-document-list__folder-count,
.visual-document-list__mono,
.visual-document-list__muted {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #9ca3af;
  font-size: 10px;
  line-height: 15px;
}

.visual-document-list__mono {
  font-family: var(--app-font-family-mono);
  font-variant-numeric: tabular-nums;
}

.visual-document-list__status {
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 9px;
  line-height: 14px;
  font-weight: 600;
}

.visual-document-list__status.is-success { background: #ecfdf5; color: #047857; }
.visual-document-list__status.is-warning { background: #fffbeb; color: #b45309; }
.visual-document-list__status.is-danger { background: #fef2f2; color: #b91c1c; }
.visual-document-list__status.is-primary { background: #eff6ff; color: #2563eb; }
.visual-document-list__status :deep(.t-icon) { flex: 0 0 auto; font-size: 10px; }

.is-spinning { animation: visual-list-spin 900ms linear infinite; }

.visual-document-list__more {
  width: 26px;
  height: 26px;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  opacity: 0;
  cursor: pointer;
}

.visual-document-list__row:hover .visual-document-list__more,
.visual-document-list__row.is-menu-open .visual-document-list__more,
.visual-document-list__row.is-selected .visual-document-list__more,
.visual-document-list__more.is-active {
  opacity: 1;
}

.visual-document-list__more:hover,
.visual-document-list__more.is-active {
  background: #f3f4f6;
  color: #374151;
}

.visual-list-menu {
  min-width: 180px;
}

.visual-list-menu--move {
  width: 100%;
  max-width: none;
  max-height: none;
  box-sizing: border-box;
  padding: 0;
  border: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: visible;
}

.visual-list-menu__back,
.visual-list-menu__target {
  width: 100%;
  min-height: 36px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.visual-list-menu__back:hover,
.visual-list-menu__back:focus-visible,
.visual-list-menu__target:hover,
.visual-list-menu__target:focus-visible {
  outline: none;
  background: #f9fafb;
  color: #111827;
}

.visual-list-menu__back span {
  flex: 0 0 auto;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.visual-list-menu__targets {
  min-height: 0;
  flex: 1 1 auto;
  overflow: visible;
}

.visual-list-menu__state {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}

.visual-list-menu__target-name,
.visual-list-menu__destination-name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-list-menu__target-count {
  flex: 0 0 auto;
  color: #9ca3af;
  font-size: 10px;
  line-height: 16px;
}

.visual-list-menu__confirm {
  padding: 6px 2px 2px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.visual-list-menu__destination {
  min-height: 36px;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f9fafb;
  color: #374151;
  font-size: 12px;
  line-height: 16px;
}

.visual-list-menu__mode {
  width: 100%;
  min-height: 36px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #fff;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
}

.visual-list-menu__mode:hover,
.visual-list-menu__mode.is-active {
  border-color: #d1d5db;
  background: #f3f4f6;
  color: #111827;
}

.visual-list-menu__mode > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.visual-list-menu__mode strong {
  font-size: inherit;
  line-height: inherit;
}

.visual-list-menu__mode small {
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
}

.visual-list-menu__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* The popup component contributes the canonical panel and the only scroll
 * container. Keep move content on that authority surface and flatten
 * FolderPickerMenu when it is nested here. */
:global(.card-more .t-popup__content:has(> .visual-list-menu--move)) {
  width: 288px !important;
  max-width: min(288px, calc(100vw - 32px)) !important;
  max-height: 256px !important;
  box-sizing: border-box !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 6px !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 16px !important;
  background: #fff !important;
  color: #374151 !important;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%) !important;
}

:global(:root[theme-mode="dark"] body .card-more .t-popup__content:has(> .visual-list-menu--move)) {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
  box-shadow: var(--mvc-shadow) !important;
}

.visual-list-menu--move :deep(.visual-folder-picker) {
  width: 100% !important;
  max-width: none !important;
  max-height: none !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.visual-list-menu--move :deep(.visual-folder-picker__list) {
  max-height: none !important;
  overflow: visible !important;
  padding: 0 !important;
}

@media (min-width: 640px) {
  .visual-list-menu__back,
  .visual-list-menu__target,
  .visual-list-menu__destination,
  .visual-list-menu__mode {
    font-size: 14px;
    line-height: 20px;
  }
}

@keyframes visual-list-spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .visual-document-list { overflow-x: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .visual-document-list__row,
  .is-spinning {
    transition: none !important;
    animation: none !important;
  }
}
</style>
