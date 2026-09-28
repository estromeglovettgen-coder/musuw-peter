<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatFileSize, getFileIcon } from '@/utils/files';
import { useTagChipsOverflow } from '@/composables/useTagChipsOverflow';
import DocumentActionMenu from './DocumentActionMenu.vue';
import FolderActionMenu from './FolderActionMenu.vue';
import FolderPickerMenu, { type FolderOption } from './FolderPickerMenu.vue';
import KnowledgeProcessingTimeline from '@/components/knowledge-processing-timeline.vue';

interface Tag { id: string; name: string; color?: string; }
interface KnowledgeCard {
  id: string; knowledge_base_id?: string; parse_status: string; summary_status?: string; description?: string;
  file_name?: string; folder_path?: string; original_file_name?: string; display_name?: string; title?: string;
  type?: string; updated_at?: string; file_type?: string; isMore?: boolean; metadata?: any; error_message?: string;
  tags?: Array<{ id: string; name: string; color?: string }>; source?: string; created_at?: string;
  file_size?: number | string; channel?: string;
}

const props = defineProps<{
  items: KnowledgeCard[]; selectedIds: Set<string>; batchMode: boolean; canEdit: boolean; canDownload: boolean; canMutateKnowledge: boolean;
  traceAvailableById: Record<string, boolean>; tagList: Tag[]; folders?: Array<{ path: string; name: string; total_count: number }>;
  folderOptions?: FolderOption[]; showFolderPath?: boolean; moveMenuMode: 'normal' | 'targets' | 'confirm';
  moveTargetKbs: any[]; moveTargetsLoading: boolean; moveSelectedTargetName: string; moveMode: 'reuse_vectors' | 'reparse';
  moveSubmitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', item: KnowledgeCard): void;
  (e: 'toggle-checkbox', id: string, checked: boolean, ctx?: { e?: Event }): void;
  (e: 'menu-visible-change', visible: boolean, item: KnowledgeCard): void;
  (e: 'action', action: 'download' | 'edit' | 'view-trace' | 'reparse' | 'cancel-parse' | 'move' | 'move-folder' | 'batch-manage' | 'delete', item: KnowledgeCard): void;
  (e: 'tag-edit', item: KnowledgeCard): void;
  (e: 'open-folder', path: string): void;
  (e: 'delete-folder', path: string): void;
  (e: 'move-to-folder', item: KnowledgeCard, folderPath: string): void;
  (e: 'move-select-target', kb: any): void;
  (e: 'move-back'): void;
  (e: 'move-confirm'): void;
  (e: 'update:moveMode', mode: 'reuse_vectors' | 'reparse'): void;
}>();

const { t } = useI18n();
const { setupTagChipsObserver, getTagLimit, hasTagOverflow, getOverflowCount } = useTagChipsOverflow('tagItemId');
const folderPickerItemId = ref<string | null>(null);
const activeMenuIndex = ref(-1);
const openMenu = (index: number) => { activeMenuIndex.value = index; };
const onMenuVisibleChange = (visible: boolean, item: KnowledgeCard) => {
  if (!visible) { activeMenuIndex.value = -1; folderPickerItemId.value = null; }
  emit('menu-visible-change', visible, item);
};
const CANCELABLE_PARSE_STATUSES = new Set(['pending', 'processing', 'finalizing']);
const isParseInFlight = (status?: string): boolean => CANCELABLE_PARSE_STATUSES.has(String(status ?? ''));
const isTraceMenuVisible = (item: KnowledgeCard): boolean => {
  if (!item?.id) return false;
  if (isParseInFlight(item.parse_status)) return true;
  return props.traceAvailableById[item.id] === true;
};
const inFlightCardStatusText = (item: KnowledgeCard): string => {
  if (item.parse_status === 'finalizing') {
    if (item.summary_status === 'pending' || item.summary_status === 'processing') return t('knowledgeBase.generatingSummary');
    return t('knowledgeBase.statusFinalizing');
  }
  return t('knowledgeBase.parsingInProgress');
};
const formatDocTime = (time?: string) => {
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
const getKnowledgeType = (item: KnowledgeCard) => {
  if (item.type === 'url') return t('knowledgeBase.typeURL') || 'URL';
  if (item.type === 'manual') return t('knowledgeBase.typeManual');
  if (item.file_type) return item.file_type.toUpperCase();
  return '--';
};
const channelLabelMap: Record<string, string> = {
  web: 'knowledgeBase.channelWeb', api: 'knowledgeBase.channelApi', browser_extension: 'knowledgeBase.channelBrowserExtension',
  wechat: 'knowledgeBase.channelWechat', wecom: 'knowledgeBase.channelWecom', feishu: 'knowledgeBase.channelFeishu',
  gitlab: 'knowledgeBase.channelGitLab', ima: 'knowledgeBase.channelIma',
  dingtalk: 'knowledgeBase.channelDingtalk', slack: 'knowledgeBase.channelSlack', im: 'knowledgeBase.channelIm',
};
const getChannelLabel = (channel: string) => { const key = channelLabelMap[channel]; return key ? t(key) : t('knowledgeBase.channelUnknown'); };
const onCardClick = (item: KnowledgeCard) => {
  if (props.batchMode) { emit('toggle-checkbox', item.id, !props.selectedIds.has(item.id)); return; }
  emit('open', item);
};

const hoveredCardItem = ref<KnowledgeCard | null>(null);
const cardPopoverPos = ref({ x: 0, y: 0 });
const CARD_POPOVER_OFFSET = 12;
const CARD_POPOVER_ESTIMATED_WIDTH = 360;
const CARD_POPOVER_ESTIMATED_HEIGHT = 300;
const cardHoverShowDelay = 300;
let cardHoverTimer: ReturnType<typeof setTimeout> | null = null;
let cardPopoverElement: HTMLElement | null = null;
const dismissCardPopover = () => {
  if (cardHoverTimer) { clearTimeout(cardHoverTimer); cardHoverTimer = null; }
  hoveredCardItem.value = null;
  cardPopoverElement = null;
};
const calculatePopoverPositionFromCard = (cardElement: HTMLElement): { x: number; y: number } => {
  const cardRect = cardElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let popoverWidth = CARD_POPOVER_ESTIMATED_WIDTH;
  let popoverHeight = CARD_POPOVER_ESTIMATED_HEIGHT;
  if (cardPopoverElement) {
    const rect = cardPopoverElement.getBoundingClientRect();
    if (rect.width > 0) popoverWidth = rect.width;
    if (rect.height > 0) popoverHeight = rect.height;
  }
  let x = 0; let y = 0;
  const rightX = cardRect.right + CARD_POPOVER_OFFSET;
  if (rightX + popoverWidth <= viewportWidth - 10) {
    x = rightX; y = cardRect.top; if (y + popoverHeight > viewportHeight - 10) y = viewportHeight - popoverHeight - 10; y = Math.max(10, y); return { x, y };
  }
  const leftX = cardRect.left - popoverWidth - CARD_POPOVER_OFFSET;
  if (leftX >= 10) {
    x = leftX; y = cardRect.top; if (y + popoverHeight > viewportHeight - 10) y = viewportHeight - popoverHeight - 10; y = Math.max(10, y); return { x, y };
  }
  const bottomY = cardRect.bottom + CARD_POPOVER_OFFSET;
  if (bottomY + popoverHeight <= viewportHeight - 10) {
    y = bottomY; x = cardRect.left; if (x + popoverWidth > viewportWidth - 10) x = viewportWidth - popoverWidth - 10; x = Math.max(10, x); return { x, y };
  }
  const topY = cardRect.top - popoverHeight - CARD_POPOVER_OFFSET;
  y = Math.max(10, topY); x = cardRect.left; if (x + popoverWidth > viewportWidth - 10) x = viewportWidth - popoverWidth - 10; x = Math.max(10, x); return { x, y };
};
const onCardMouseEnter = (ev: MouseEvent, item: KnowledgeCard) => {
  if (cardHoverTimer) { clearTimeout(cardHoverTimer); cardHoverTimer = null; }
  const cardElement = ev.currentTarget as HTMLElement;
  cardHoverTimer = setTimeout(() => {
    cardHoverTimer = null;
    if (!cardElement.isConnected || !props.items.some(candidate => candidate.id === item.id)) return;
    hoveredCardItem.value = item;
    cardPopoverPos.value = calculatePopoverPositionFromCard(cardElement);
    nextTick(() => {
      if (!cardElement.isConnected || hoveredCardItem.value?.id !== item.id) return;
      cardPopoverElement = document.querySelector('.visual-document-popover') as HTMLElement;
      if (cardPopoverElement) cardPopoverPos.value = calculatePopoverPositionFromCard(cardElement);
    });
  }, cardHoverShowDelay);
};
const onCardMouseLeave = () => {
  dismissCardPopover();
};
watch(() => props.items, dismissCardPopover);
onBeforeUnmount(dismissCardPopover);
const onOpenFolder = (path: string) => {
  dismissCardPopover();
  emit('open-folder', path);
};
const onFolderPicked = (item: KnowledgeCard, path: string) => {
  folderPickerItemId.value = null; if (item.isMore !== undefined) item.isMore = false; activeMenuIndex.value = -1; emit('move-to-folder', item, path);
};
const handleAction = (action: 'download' | 'edit' | 'view-trace' | 'reparse' | 'cancel-parse' | 'move' | 'move-folder' | 'batch-manage' | 'delete', item: KnowledgeCard) => {
  if (action === 'move-folder') { folderPickerItemId.value = item.id; return; }
  if (action !== 'move') { if (item.isMore !== undefined) item.isMore = false; activeMenuIndex.value = -1; }
  emit('action', action, item);
};
</script>

<template>
  <div class="visual-document-grid" role="list">
    <article v-for="folder in folders" :key="'folder-' + folder.path" class="visual-folder-card" :title="folder.path" role="button" tabindex="0" @click="onOpenFolder(folder.path)" @keydown.enter.self="onOpenFolder(folder.path)" @keydown.space.prevent.self="onOpenFolder(folder.path)">
      <FolderActionMenu v-if="canEdit && canMutateKnowledge" class="visual-folder-card__actions" @delete="emit('delete-folder', folder.path)" />
      <div class="visual-folder-card__main"><t-icon name="folder" class="visual-folder-card__icon" /><span class="visual-folder-card__title">{{ folder.name }}</span></div>
      <div class="visual-folder-card__footer">{{ t('knowledgeBase.folderTree.folderCardCount', { count: folder.total_count }) }}</div>
    </article>

    <article v-for="(item, index) in items" :key="item.id" class="visual-document-card" :class="{ 'is-selected': selectedIds.has(item.id), 'is-batch-mode': batchMode }" :data-select-id="item.id" role="listitem" tabindex="0" @click="onCardClick(item)" @keydown.enter="onCardClick(item)" @mouseenter="onCardMouseEnter($event, item)" @mouseleave="onCardMouseLeave">
      <div class="visual-document-card__body">
        <div class="visual-document-card__top">
          <div class="visual-document-card__header">
            <div v-if="canEdit && batchMode" class="visual-document-card__check" @click.stop><t-checkbox size="small" :checked="selectedIds.has(item.id)" :title="item.file_name" @change="(checked: boolean, ctx?: { e?: Event }) => emit('toggle-checkbox', item.id, checked, ctx)" /></div>
            <t-icon :name="getFileIcon(item)" class="visual-document-card__file-icon" />
            <h3 class="visual-document-card__title" :title="item.file_name">{{ item.file_name }}</h3>
            <t-popup v-if="canEdit" v-model="item.isMore" overlayClassName="card-more" :on-visible-change="(v: boolean) => onMenuVisibleChange(v, item)" trigger="click" destroy-on-close placement="bottom-right">
              <button type="button" class="visual-document-card__more" :class="{ 'is-active': activeMenuIndex === index }" :aria-label="$t('common.more')" @click.stop="openMenu(index)"><t-icon name="ellipsis" /></button>
              <template #content>
                <div v-if="folderPickerItemId === item.id" class="visual-card-menu visual-card-menu--move"><FolderPickerMenu :options="folderOptions || []" :current-path="item.folder_path || ''" show-back @back="folderPickerItemId = null" @confirm="(path: string) => onFolderPicked(item, path)" /></div>
                <div v-else-if="moveMenuMode === 'normal'" class="visual-card-menu"><DocumentActionMenu :item="item" :can-download="canDownload" :can-mutate-knowledge="canMutateKnowledge" :trace-visible="isTraceMenuVisible(item)" @download="handleAction('download', item)" @edit="handleAction('edit', item)" @view-trace="handleAction('view-trace', item)" @reparse="handleAction('reparse', item)" @cancel-parse="handleAction('cancel-parse', item)" @move="handleAction('move', item)" @move-folder="handleAction('move-folder', item)" @batch-manage="handleAction('batch-manage', item)" @delete="handleAction('delete', item)" /></div>
                <div v-else-if="moveMenuMode === 'targets'" class="visual-card-menu visual-card-menu--move">
                  <button type="button" class="visual-card-menu__back" @click.stop="emit('move-back')"><t-icon name="chevron-left" size="16px" /><span>{{ $t('knowledgeBase.moveToKnowledgeBase') }}</span></button>
                  <div class="visual-card-menu__targets">
                    <div v-if="moveTargetsLoading" class="visual-card-menu__state"><t-loading size="small" /></div>
                    <div v-else-if="moveTargetKbs.length === 0" class="visual-card-menu__state">{{ $t('knowledgeBase.moveNoTargets') }}</div>
                    <template v-else><button v-for="kb in moveTargetKbs" :key="kb.id" type="button" class="visual-card-menu__target" @click.stop="emit('move-select-target', kb)"><t-icon name="root-list" /><span class="visual-card-menu__target-name">{{ kb.name }}</span><span v-if="kb.knowledge_count !== undefined" class="visual-card-menu__target-count">{{ kb.knowledge_count }}</span></button></template>
                  </div>
                </div>
                <div v-else-if="moveMenuMode === 'confirm'" class="visual-card-menu visual-card-menu--move">
                  <button type="button" class="visual-card-menu__back" @click.stop="emit('move-back')"><t-icon name="chevron-left" size="16px" /><span>{{ $t('knowledgeBase.moveConfirmTitle') }}</span></button>
                  <div class="visual-card-menu__confirm">
                    <div class="visual-card-menu__destination"><t-icon name="arrow-right" size="14px" /><span class="visual-card-menu__destination-name">{{ moveSelectedTargetName }}</span></div>
                    <button type="button" class="visual-card-menu__mode" :class="{ 'is-active': moveMode === 'reuse_vectors' }" @click.stop="emit('update:moveMode', 'reuse_vectors')"><t-radio :checked="moveMode === 'reuse_vectors'" /><span><strong>{{ $t('knowledgeBase.moveModeReuseVectors') }}</strong><small>{{ $t('knowledgeBase.moveModeReuseVectorsDesc') }}</small></span></button>
                    <button type="button" class="visual-card-menu__mode" :class="{ 'is-active': moveMode === 'reparse' }" @click.stop="emit('update:moveMode', 'reparse')"><t-radio :checked="moveMode === 'reparse'" /><span><strong>{{ $t('knowledgeBase.moveModeReparse') }}</strong><small>{{ $t('knowledgeBase.moveModeReparseDesc') }}</small></span></button>
                    <div class="visual-card-menu__actions"><t-button size="small" variant="outline" @click.stop="emit('move-back')">{{ $t('common.cancel') }}</t-button><t-button size="small" theme="primary" :loading="moveSubmitting" @click.stop="emit('move-confirm')">{{ $t('knowledgeBase.moveConfirm') }}</t-button></div>
                  </div>
                </div>
              </template>
            </t-popup>
          </div>

          <div v-if="isParseInFlight(item.parse_status)" class="visual-document-card__status is-processing"><t-icon name="loading" class="is-spinning" /><button type="button" @click.stop="handleAction('view-trace', item)">{{ inFlightCardStatusText(item) }}</button></div>
          <div v-else-if="item.parse_status === 'failed'" class="visual-document-card__status is-failed"><t-icon name="close-circle" /><button type="button" :title="item.error_message || $t('knowledgeBase.parsingFailed')" @click.stop="handleAction('view-trace', item)">{{ item.error_message || $t('knowledgeBase.parsingFailed') }}</button></div>
          <div v-else-if="item.parse_status === 'draft'" class="visual-document-card__status is-draft"><span>{{ $t('knowledgeBase.draft') }}</span><small>{{ $t('knowledgeBase.draftTip') }}</small></div>
          <div v-else-if="item.parse_status === 'completed' && (item.summary_status === 'pending' || item.summary_status === 'processing')" class="visual-document-card__status is-processing"><t-icon name="loading" class="is-spinning" /><span>{{ $t('knowledgeBase.generatingSummary') }}</span></div>
          <p v-else-if="item.parse_status === 'completed'" class="visual-document-card__description">{{ item.description }}</p>

          <div v-if="tagList.length" class="visual-document-card__tags" @click.stop>
            <template v-if="(item.tags || []).length > 0">
              <t-tooltip v-if="hasTagOverflow(item.id, (item.tags || []).length)" :content="(item.tags || []).map((tag: any) => tag.name).join(', ')" placement="top">
                <div class="visual-document-card__tag-list" :ref="(el: any) => setupTagChipsObserver(el, item.id, (item.tags || []).length)" @click="canEdit && emit('tag-edit', item)"><span v-for="tag in (item.tags || []).slice(0, getTagLimit(item.id))" :key="tag.id" class="visual-document-card__tag">{{ tag.name }}</span><span class="visual-document-card__tag-overflow">+{{ getOverflowCount(item.id, (item.tags || []).length) }}</span></div>
              </t-tooltip>
              <div v-else class="visual-document-card__tag-list" :ref="(el: any) => setupTagChipsObserver(el, item.id, (item.tags || []).length)" @click="canEdit && emit('tag-edit', item)"><span v-for="tag in (item.tags || []).slice(0, getTagLimit(item.id))" :key="tag.id" class="visual-document-card__tag">{{ tag.name }}</span></div>
            </template>
            <button v-else-if="canEdit" type="button" class="visual-document-card__add-tag" @click="emit('tag-edit', item)"><t-icon name="add" size="11px" />{{ $t('knowledgeBase.tagLabel') }}</button>
          </div>
        </div>
      </div>

      <footer class="visual-document-card__footer">
        <button v-if="showFolderPath && item.folder_path" type="button" class="visual-document-card__folder" :title="item.folder_path" @click.stop="emit('open-folder', item.folder_path)"><t-icon name="folder" /><span>{{ item.folder_path }}</span></button>
        <time v-else class="visual-document-card__time">{{ formatDocTime(item.updated_at) }}</time>
        <span class="visual-document-card__type">{{ getKnowledgeType(item) }}</span>
      </footer>
    </article>
  </div>

  <Teleport to="body">
    <div v-show="hoveredCardItem" class="visual-document-popover" :style="{ left: cardPopoverPos.x + 'px', top: cardPopoverPos.y + 'px' }">
      <template v-if="hoveredCardItem">
        <h4 class="visual-document-popover__title">{{ hoveredCardItem.file_name }}</h4>
        <div v-if="isParseInFlight(hoveredCardItem.parse_status)" class="visual-document-popover__timeline"><KnowledgeProcessingTimeline :knowledge-id="hoveredCardItem.id" :parse-status="hoveredCardItem.parse_status" :auto-poll="false" :compact="true" /></div>
        <div v-else-if="hoveredCardItem.parse_status === 'failed'" class="visual-document-popover__timeline is-failed"><KnowledgeProcessingTimeline :knowledge-id="hoveredCardItem.id" :parse-status="hoveredCardItem.parse_status" :auto-poll="false" :compact="true" /></div>
        <div v-else-if="hoveredCardItem.parse_status === 'draft'" class="visual-document-popover__draft">{{ $t('knowledgeBase.draft') }}</div>
        <template v-else>
          <p v-if="hoveredCardItem.description" class="visual-document-popover__description">{{ hoveredCardItem.description }}</p>
          <p v-if="hoveredCardItem.source" class="visual-document-popover__source" :title="hoveredCardItem.source"><t-icon name="link" size="12px" />{{ hoveredCardItem.source }}</p>
          <div class="visual-document-popover__extra"><span v-if="hoveredCardItem.created_at">{{ $t('knowledgeBase.createdAt') }}：{{ formatDocTime(hoveredCardItem.created_at) }}</span><span v-if="formatFileSize(hoveredCardItem.file_size)">{{ formatFileSize(hoveredCardItem.file_size) }}</span></div>
        </template>
        <div class="visual-document-popover__meta"><span>{{ $t('knowledgeBase.updatedAt') }}：{{ formatDocTime(hoveredCardItem.updated_at) }}</span><span v-if="hoveredCardItem.channel && hoveredCardItem.channel !== 'web'">{{ getChannelLabel(hoveredCardItem.channel) }}</span><div v-if="hoveredCardItem.tags?.length" class="visual-document-popover__tags"><span v-for="tag in hoveredCardItem.tags" :key="tag.id">{{ tag.name }}</span></div><strong>{{ getKnowledgeType(hoveredCardItem) }}</strong></div>
        <div class="visual-document-popover__hint">{{ $t('knowledgeBase.clickToViewFull') }}</div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped lang="less">
.visual-document-grid { width: 100%; display: grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); grid-auto-rows: max-content; gap: 16px; align-content: start; padding: 0 0 16px; box-sizing: border-box; }
.visual-folder-card,.visual-document-card { position: relative; width: 100%; height: 192px; min-width: 0; box-sizing: border-box; border: 1px solid rgb(229 231 235 / 90%); border-radius: 16px; background: #fff; color: #1f2937; text-align: left; box-shadow: none; transition: all 200ms ease; }
.visual-folder-card { padding: 16px; display: flex; flex-direction: column; justify-content: space-between; font: inherit; cursor: pointer; }
.visual-folder-card:hover,.visual-document-card:hover { border-color: #9ca3af; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 10%),0 2px 4px -2px rgb(0 0 0 / 10%); }
.visual-folder-card:focus-visible,.visual-document-card:focus-visible { outline: 2px solid #9ca3af; outline-offset: 2px; }
.visual-folder-card__main { display: flex; flex-direction: column; gap: 8px; }
.visual-folder-card__actions { position: absolute; top: 10px; right: 10px; }
.visual-folder-card__icon { width: 20px; height: 20px; color: #374151; font-size: 20px; }
.visual-folder-card__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 18px; font-weight: 700; color: #111827; }
.visual-folder-card__footer,.visual-document-card__footer { min-height: 24px; padding-top: 10px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #9ca3af; font-family: var(--app-font-family-mono); font-size: 10px; line-height: 14px; }
.visual-document-card { padding: 16px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; user-select: none; }
.visual-document-card.is-selected { border-color: #111827; box-shadow: 0 0 0 2px rgb(17 24 39 / 10%),0 1px 2px rgb(0 0 0 / 5%); }
.visual-document-card__body,.visual-document-card__top { min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
.visual-document-card__top { gap: 8px; }
.visual-document-card__header { min-width: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.visual-document-card__check { flex: 0 0 auto; }
.visual-document-card__file-icon { flex: 0 0 16px; width: 16px; height: 16px; color: #4b5563; font-size: 16px; }
.visual-document-card__title { min-width: 0; flex: 1 1 auto; margin: 0; overflow: hidden; color: #030712; font-size: 12px; line-height: 18px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.visual-document-card__more { flex: 0 0 22px; width: 22px; height: 22px; padding: 4px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-document-card__more:hover,.visual-document-card__more.is-active { background: #f3f4f6; color: #374151; }
.visual-document-card__more :deep(.t-icon) { font-size: 14px; }
.visual-document-card__description { margin: 0; overflow: hidden; color: #6b7280; font-size: 11px; line-height: 1.625; font-weight: 400; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.visual-document-card__status { max-width: 100%; align-self: flex-start; min-height: 20px; padding: 2px 8px; border: 1px solid #e5e7eb; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px; background: #f9fafb; color: #6b7280; font-size: 10px; line-height: 14px; font-weight: 700; }
.visual-document-card__status button { min-width: 0; padding: 0; border: 0; overflow: hidden; background: transparent; color: inherit; font: inherit; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.visual-document-card__status.is-processing { border-color: #fde68a; background: #fffbeb; color: #b45309; }
.visual-document-card__status.is-failed { border-color: #fecaca; background: #fef2f2; color: #dc2626; }
.visual-document-card__status.is-draft { border-color: #e5e7eb; background: #f9fafb; color: #6b7280; }
.visual-document-card__status.is-draft small { color: #9ca3af; font-size: 9px; }
.visual-document-card__status .is-spinning { animation: visual-document-spin .8s linear infinite; }
.visual-document-card__tags { min-height: 22px; margin-top: auto; overflow: hidden; }
.visual-document-card__tag-list { max-width: 100%; min-width: 0; height: 22px; display: flex; align-items: center; gap: 4px; overflow: hidden; cursor: pointer; }
.visual-document-card__tag,.visual-document-card__tag-overflow,.visual-document-card__add-tag { flex: 0 0 auto; max-width: 120px; height: 20px; padding: 2px 8px; box-sizing: border-box; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #f3f4f6; color: #4b5563; font-size: 10px; line-height: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.visual-document-card__tag-overflow { background: #fff; color: #6b7280; }
.visual-document-card__add-tag { border-style: dashed; background: #fff; color: #6b7280; font: inherit; cursor: pointer; }
.visual-document-card__folder { min-width: 0; max-width: 72%; padding: 0; border: 0; display: inline-flex; align-items: center; gap: 4px; overflow: hidden; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.visual-document-card__folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-document-card__folder :deep(.t-icon) { flex: 0 0 10px; font-size: 10px; }
.visual-document-card__type { flex: 0 0 auto; min-width: 30px; padding: 2px 8px; border-radius: 4px; background: #f3f4f6; color: #4b5563; font-family: var(--app-font-family); font-size: 9px; line-height: 13px; font-weight: 700; text-align: center; text-transform: uppercase; }
.visual-card-menu {
  width: 230px;
  max-width: calc(100vw - 24px);
  padding: 5px;
  box-sizing: border-box;
}

/* Move targets use the same 288px scene-model popup geometry as Settings. The
 * teleported card-more content owns the painted panel and single scroll
 * container; this node is only the unpainted move-state layout. */
.visual-card-menu--move {
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

.visual-card-menu__back,
.visual-card-menu__target {
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

.visual-card-menu__back:hover,
.visual-card-menu__back:focus-visible,
.visual-card-menu__target:hover,
.visual-card-menu__target:focus-visible {
  outline: none;
  background: #f9fafb;
  color: #111827;
}

.visual-card-menu__back span {
  flex: 0 0 auto;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.visual-card-menu__targets {
  min-height: 0;
  flex: 1 1 auto;
  overflow: visible;
}

.visual-card-menu__state {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}

.visual-card-menu__target-name,
.visual-card-menu__destination-name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-card-menu__target-count {
  flex: 0 0 auto;
  color: #9ca3af;
  font-size: 10px;
  line-height: 16px;
}

.visual-card-menu__confirm {
  padding: 6px 2px 2px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.visual-card-menu__destination {
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

.visual-card-menu__mode {
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

.visual-card-menu__mode:hover,
.visual-card-menu__mode.is-active {
  border-color: #d1d5db;
  background: #f3f4f6;
  color: #111827;
}

.visual-card-menu__mode > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.visual-card-menu__mode strong {
  font-size: inherit;
  line-height: inherit;
}

.visual-card-menu__mode small {
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
}

.visual-card-menu__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* The popup component contributes the canonical panel and the only scroll
 * container. Keep move content on that authority surface and flatten
 * FolderPickerMenu when it is nested here. */
:global(.card-more .t-popup__content:has(> .visual-card-menu--move)) {
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

:global(:root[theme-mode="dark"] body .card-more .t-popup__content:has(> .visual-card-menu--move)) {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
  box-shadow: var(--mvc-shadow) !important;
}

.visual-card-menu--move :deep(.visual-folder-picker) {
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

.visual-card-menu--move :deep(.visual-folder-picker__list) {
  max-height: none !important;
  overflow: visible !important;
  padding: 0 !important;
}

@media (min-width: 640px) {
  .visual-card-menu__back,
  .visual-card-menu__target,
  .visual-card-menu__destination,
  .visual-card-menu__mode {
    font-size: 14px;
    line-height: 20px;
  }
}
.visual-document-popover { position: fixed; z-index: 10002; width: 360px; max-width: calc(100vw - 20px); max-height: min(420px,calc(100vh - 20px)); overflow-y: auto; box-sizing: border-box; padding: 14px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; color: #374151; box-shadow: 0 16px 38px rgb(15 23 42 / 14%); pointer-events: none; }
.visual-document-popover__title { margin: 0 0 8px; overflow: hidden; color: #111827; font-size: 12px; line-height: 18px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.visual-document-popover__timeline { margin: 2px 0 5px; }
.visual-document-popover__timeline.is-failed { color: #dc2626; }
.visual-document-popover__draft { padding: 6px 0; color: #6b7280; font-size: 10px; }
.visual-document-popover__description { margin: 0; overflow: hidden; color: #6b7280; font-size: 10px; line-height: 16px; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; }
.visual-document-popover__source { margin: 8px 0 0; display: flex; align-items: center; gap: 5px; overflow: hidden; color: #9ca3af; font-size: 9px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.visual-document-popover__extra { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px 10px; color: #9ca3af; font-size: 9px; line-height: 14px; }
.visual-document-popover__meta { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6; display: flex; flex-wrap: wrap; align-items: center; gap: 5px 8px; color: #9ca3af; font-size: 9px; line-height: 14px; }
.visual-document-popover__meta strong { margin-left: auto; color: #6b7280; font-size: 9px; }
.visual-document-popover__tags { display: flex; flex-wrap: wrap; gap: 4px; }
.visual-document-popover__tags span { padding: 2px 5px; border-radius: 5px; background: #f3f4f6; color: #6b7280; }
.visual-document-popover__hint { margin-top: 8px; color: #d1d5db; font-size: 8px; text-align: right; }
@keyframes visual-document-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .visual-folder-card,.visual-document-card,.visual-document-card__status .is-spinning { transition: none !important; animation: none !important; } }
</style>
