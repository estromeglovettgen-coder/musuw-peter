<template>
  <Teleport to="body">
    <Transition name="visual-tag-manage">
      <div v-if="drawerVisible" class="visual-tag-manage__overlay" role="presentation" @click.self="drawerVisible = false">
        <aside class="visual-tag-manage" role="dialog" aria-modal="true" :aria-label="$t('knowledgeBase.tagManageTitle')">
          <header class="visual-tag-manage__header">
            <div class="visual-tag-manage__heading">
              <span class="visual-tag-manage__heading-icon" aria-hidden="true"><t-icon name="discount" /></span>
              <div>
                <h3>{{ $t('knowledgeBase.tagManageTitle') }}</h3>
                <p>{{ $t('knowledgeBase.tagManageDescription') }}</p>
              </div>
            </div>
            <button type="button" class="visual-tag-manage__close" :aria-label="$t('common.close')" @click="drawerVisible = false">
              <t-icon name="close" />
            </button>
          </header>

          <div class="visual-tag-manage__content">
            <div class="visual-tag-manage__section-head">
              <h4>{{ $t('knowledgeBase.tagManageListSection') }}</h4>
              <span>{{ total }}</span>
            </div>

            <div class="visual-tag-manage__toolbar">
              <t-input
                v-model.trim="searchQuery"
                size="small"
                :placeholder="$t('knowledgeBase.tagSearchPlaceholder')"
                clearable
                class="visual-tag-manage__search"
              >
                <template #prefix-icon><t-icon name="search" size="14px" /></template>
              </t-input>
              <button
                type="button"
                class="visual-tag-manage__create-trigger"
                :disabled="creatingTag"
                :aria-label="$t('knowledgeBase.tagCreateAction')"
                :title="$t('knowledgeBase.tagCreateAction')"
                @click="startCreateTag"
              >
                <t-icon name="add" />
              </button>
            </div>

            <div v-if="loading && !tags.length" class="visual-tag-manage__loading">
              <div v-for="n in 6" :key="n" class="visual-tag-manage__skeleton">
                <t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '48px', type: 'rect' }]" />
              </div>
            </div>

            <div v-else-if="!tags.length && !creatingTag" class="visual-tag-manage__empty">
              <t-empty :description="$t('knowledgeBase.tagEmptyResult')" />
            </div>

            <ul v-else class="visual-tag-manage__grid">
              <li v-if="creatingTag" class="visual-tag-tile is-editing" @click.stop>
                <span class="visual-tag-tile__badge"><t-icon name="discount" /></span>
                <t-input
                  ref="newTagInputRef"
                  v-model="newTagName"
                  size="small"
                  :maxlength="40"
                  class="visual-tag-tile__input"
                  :placeholder="$t('knowledgeBase.tagNamePlaceholder')"
                  @enter="submitCreateTag"
                  @keydown="(_v: string, ctx?: { e?: KeyboardEvent }) => onEditKeydown(ctx, cancelCreateTag)"
                />
                <div class="visual-tag-tile__actions">
                  <button type="button" class="visual-tag-tile__action" :disabled="creatingTagLoading" :title="$t('common.create')" @click.stop="submitCreateTag">
                    <t-loading v-if="creatingTagLoading" size="small" />
                    <t-icon v-else name="check" />
                  </button>
                  <button type="button" class="visual-tag-tile__action" :title="$t('common.cancel')" @click.stop="cancelCreateTag">
                    <t-icon name="close" />
                  </button>
                </div>
              </li>

              <li
                v-for="tag in tags"
                :key="tag.id"
                class="visual-tag-tile"
                :class="{ 'is-editing': editingTagId === tag.id }"
                @click.stop
              >
                <template v-if="editingTagId === tag.id">
                  <span class="visual-tag-tile__badge"><t-icon name="discount" /></span>
                  <t-input
                    :ref="(el: any) => setEditingTagInputRef(el, tag.id)"
                    v-model="editingTagName"
                    size="small"
                    :maxlength="40"
                    class="visual-tag-tile__input"
                    :placeholder="$t('knowledgeBase.tagNamePlaceholder')"
                    @enter="submitEditTag"
                    @keydown="(_v: string, ctx?: { e?: KeyboardEvent }) => onEditKeydown(ctx, cancelEditTag)"
                  />
                  <div class="visual-tag-tile__actions">
                    <button type="button" class="visual-tag-tile__action" :disabled="editingTagSubmitting" :title="$t('common.save')" @click.stop="submitEditTag">
                      <t-loading v-if="editingTagSubmitting" size="small" />
                      <t-icon v-else name="check" />
                    </button>
                    <button type="button" class="visual-tag-tile__action" :title="$t('common.cancel')" @click.stop="cancelEditTag">
                      <t-icon name="close" />
                    </button>
                  </div>
                </template>

                <template v-else>
                  <span class="visual-tag-tile__badge"><t-icon name="discount" /></span>
                  <span class="visual-tag-tile__copy">
                    <strong :title="tag.name">{{ tag.name }}</strong>
                    <small>
                      {{ isFaq
                        ? $t('knowledgeBase.tagManageFaqCount', { count: tag.chunk_count || 0 })
                        : $t('knowledgeBase.tagManageDocCount', { count: tag.knowledge_count || 0 }) }}
                    </small>
                  </span>
                  <div class="visual-tag-tile__actions">
                    <button type="button" class="visual-tag-tile__action" :title="$t('knowledgeBase.tagEditAction')" @click="startEditTag(tag)">
                      <t-icon name="edit" />
                    </button>
                    <t-popconfirm
                      :content="getDeleteConfirmContent(tag)"
                      :confirm-btn="{ content: $t('common.delete'), theme: 'danger' }"
                      :cancel-btn="{ content: $t('common.cancel') }"
                      placement="bottom-right"
                      @confirm="deleteTag(tag)"
                    >
                      <button type="button" class="visual-tag-tile__action is-danger" :title="$t('knowledgeBase.tagDeleteAction')" @click.stop>
                        <t-icon name="delete" />
                      </button>
                    </t-popconfirm>
                  </div>
                </template>
              </li>
            </ul>

            <div v-if="hasMore && tags.length" class="visual-tag-manage__load-more">
              <button type="button" :disabled="loadingMore" @click="loadTags(false)">
                <t-loading v-if="loadingMore" size="small" />
                <span>{{ $t('tenant.loadMore') }}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, type ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import {
  listKnowledgeTags,
  createKnowledgeBaseTag,
  updateKnowledgeBaseTag,
  deleteKnowledgeBaseTag,
} from '@/api/knowledge-base/index';

type TagRow = {
  id: string;
  seq_id: number;
  name: string;
  knowledge_count?: number;
  chunk_count?: number;
};

type TagInputInstance = ComponentPublicInstance<{ focus: () => void; select: () => void }>;

const TAG_PAGE_SIZE = 50;

const props = defineProps<{
  visible: boolean;
  kbId: string;
  isFaq?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  changed: [payload?: { deletedTagId?: string }];
}>();

const { t } = useI18n();

const drawerVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const tags = ref<TagRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const page = ref(1);
const hasMore = ref(false);
const total = ref(0);
const searchQuery = ref('');
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const creatingTag = ref(false);
const creatingTagLoading = ref(false);
const newTagName = ref('');
const newTagInputRef = ref<TagInputInstance | null>(null);

const editingTagId = ref<string | null>(null);
const editingTagName = ref('');
const editingTagSubmitting = ref(false);
const editingTagInputRefs = new Map<string, TagInputInstance | null>();

const setEditingTagInputRef = (el: TagInputInstance | null, tagId: string) => {
  if (el) {
    editingTagInputRefs.set(tagId, el);
  } else {
    editingTagInputRefs.delete(tagId);
  }
};

const getDeleteConfirmContent = (tag: { name: string }) =>
  t(props.isFaq ? 'knowledgeBase.tagDeleteDesc' : 'knowledgeBase.tagDeleteDescDoc', { name: tag.name });

const onEditKeydown = (ctx: { e?: KeyboardEvent } | undefined, cancel: () => void) => {
  if (ctx?.e?.key === 'Escape') {
    ctx.e.stopPropagation();
    ctx.e.preventDefault();
    cancel();
  }
};

const resetLocalState = () => {
  cancelCreateTag();
  cancelEditTag();
  searchQuery.value = '';
};

const loadTags = async (reset = false) => {
  if (!props.kbId) {
    tags.value = [];
    total.value = 0;
    hasMore.value = false;
    page.value = 1;
    return;
  }
  if (reset) {
    page.value = 1;
    tags.value = [];
    total.value = 0;
    hasMore.value = false;
  } else if (loading.value || loadingMore.value) {
    return;
  }

  const currentPage = page.value || 1;
  loading.value = currentPage === 1;
  loadingMore.value = currentPage > 1;

  try {
    const res: any = await listKnowledgeTags(props.kbId, {
      page: currentPage,
      page_size: TAG_PAGE_SIZE,
      keyword: searchQuery.value || undefined,
    });
    const pageData = (res?.data || {}) as { data?: TagRow[]; total?: number };
    const pageTags = (pageData.data || []).map((tag) => ({
      ...tag,
      id: String(tag.id),
    }));

    if (currentPage === 1) {
      tags.value = pageTags;
    } else {
      tags.value = [...tags.value, ...pageTags];
    }

    total.value = pageData.total || tags.value.length;
    hasMore.value = tags.value.length < total.value;
    if (hasMore.value) {
      page.value = currentPage + 1;
    }
  } catch (error) {
    console.error('Failed to load tags', error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const startCreateTag = () => {
  if (!props.kbId || creatingTag.value) return;
  cancelEditTag();
  creatingTag.value = true;
  nextTick(() => {
    newTagInputRef.value?.focus?.();
    newTagInputRef.value?.select?.();
  });
};

const cancelCreateTag = () => {
  creatingTag.value = false;
  newTagName.value = '';
};

const submitCreateTag = async () => {
  if (!props.kbId) return;
  const name = newTagName.value.trim();
  if (!name) {
    MessagePlugin.warning(t('knowledgeBase.tagNameRequired'));
    return;
  }
  creatingTagLoading.value = true;
  try {
    await createKnowledgeBaseTag(props.kbId, { name });
    MessagePlugin.success(t('knowledgeBase.tagCreateSuccess'));
    cancelCreateTag();
    await loadTags(true);
    emit('changed');
  } catch (error: any) {
    MessagePlugin.error(error?.message || t('common.operationFailed'));
  } finally {
    creatingTagLoading.value = false;
  }
};

const startEditTag = (tag: TagRow) => {
  cancelCreateTag();
  editingTagId.value = tag.id;
  editingTagName.value = tag.name;
  nextTick(() => {
    editingTagInputRefs.get(tag.id)?.focus?.();
    editingTagInputRefs.get(tag.id)?.select?.();
  });
};

const cancelEditTag = () => {
  editingTagId.value = null;
  editingTagName.value = '';
};

const submitEditTag = async () => {
  if (!props.kbId || !editingTagId.value) return;
  const name = editingTagName.value.trim();
  if (!name) {
    MessagePlugin.warning(t('knowledgeBase.tagNameRequired'));
    return;
  }
  const current = tags.value.find((tag) => tag.id === editingTagId.value);
  if (current && name === current.name) {
    cancelEditTag();
    return;
  }
  editingTagSubmitting.value = true;
  try {
    await updateKnowledgeBaseTag(props.kbId, editingTagId.value, { name });
    MessagePlugin.success(t('knowledgeBase.tagEditSuccess'));
    cancelEditTag();
    await loadTags(true);
    emit('changed');
  } catch (error: any) {
    MessagePlugin.error(error?.message || t('common.operationFailed'));
  } finally {
    editingTagSubmitting.value = false;
  }
};

const deleteTag = async (tag: TagRow) => {
  if (!props.kbId) return;
  cancelCreateTag();
  cancelEditTag();
  try {
    await deleteKnowledgeBaseTag(props.kbId, tag.seq_id, { force: true });
    MessagePlugin.success(t('knowledgeBase.tagDeleteSuccess'));
    await loadTags(true);
    emit('changed', { deletedTagId: tag.id });
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      emit('changed', { deletedTagId: tag.id });
    })();
  } catch (error: any) {
    MessagePlugin.error(error?.message || t('common.operationFailed'));
  }
};

watch(
  () => props.visible,
  (open) => {
    if (open && props.kbId) {
      void loadTags(true);
    } else if (!open) {
      resetLocalState();
    }
  },
);

watch(searchQuery, (newVal, oldVal) => {
  if (newVal === oldVal || !props.visible || !props.kbId) return;
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    void loadTags(true);
  }, 300);
});
</script>

<style scoped lang="less">
.visual-tag-manage__overlay {
  position: fixed;
  inset: 0;
  z-index: 3050;
  display: flex;
  justify-content: flex-end;
  background: rgb(15 23 42 / 18%);
  backdrop-filter: blur(2px);
}

.visual-tag-manage {
  width: min(480px, 100vw);
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  box-shadow: -18px 0 50px rgb(15 23 42 / 12%);
  color: #1f2937;
}

.visual-tag-manage__header {
  flex: 0 0 auto;
  padding: 20px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.visual-tag-manage__heading {
  min-width: 0;
  display: flex;
  gap: 10px;
}

.visual-tag-manage__heading-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
}

.visual-tag-manage__heading h3 {
  margin: 0;
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
}

.visual-tag-manage__heading p {
  margin: 3px 0 0;
  color: #9ca3af;
  font-size: 11px;
  line-height: 16px;
}

.visual-tag-manage__close,
.visual-tag-manage__create-trigger,
.visual-tag-tile__action {
  border: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
}

.visual-tag-manage__close {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 6px;
  border-radius: 8px;
  color: #9ca3af;
}

.visual-tag-manage__close:hover,
.visual-tag-manage__create-trigger:hover:not(:disabled),
.visual-tag-tile__action:hover:not(:disabled) {
  background: #f3f4f6;
  color: #374151;
}

.visual-tag-manage__content {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 18px 20px 24px;
}

.visual-tag-manage__section-head {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #9ca3af;
  font-size: 10px;
  line-height: 16px;
}

.visual-tag-manage__section-head h4 {
  margin: 0;
  color: #374151;
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.visual-tag-manage__toolbar {
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.visual-tag-manage__search {
  min-width: 0;
  flex: 1 1 auto;
}

.visual-tag-manage__search :deep(.t-input) {
  min-height: 34px;
  border-color: #e5e7eb;
  border-radius: 9px;
  background: #f9fafb;
  box-shadow: none !important;
  font-size: 12px;
}

.visual-tag-manage__search :deep(.t-input.t-is-focused) {
  border-color: #d1d5db;
  background: #fff;
}

.visual-tag-manage__create-trigger {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #fff;
  color: #6b7280;
}

.visual-tag-manage__create-trigger:disabled {
  cursor: default;
  opacity: .45;
}

.visual-tag-manage__loading,
.visual-tag-manage__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.visual-tag-manage__skeleton {
  min-width: 0;
}

.visual-tag-manage__empty {
  padding: 36px 0;
}

.visual-tag-manage__grid {
  list-style: none;
  margin: 0;
  padding: 0;
}

.visual-tag-tile {
  min-width: 0;
  min-height: 50px;
  padding: 7px 7px 7px 9px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  transition: border-color 140ms ease, background-color 140ms ease;
}

.visual-tag-tile:hover:not(.is-editing) {
  border-color: #d1d5db;
  background: #f9fafb;
}

.visual-tag-tile.is-editing {
  border-color: #d1d5db;
  background: #f9fafb;
}

.visual-tag-tile__badge {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #9ca3af;
}

.visual-tag-tile__badge :deep(.t-icon) {
  font-size: 13px;
}

.visual-tag-tile__copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.visual-tag-tile__copy strong,
.visual-tag-tile__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-tag-tile__copy strong {
  color: #374151;
  font-size: 12px;
  line-height: 17px;
  font-weight: 600;
}

.visual-tag-tile__copy small {
  color: #9ca3af;
  font-size: 10px;
  line-height: 15px;
}

.visual-tag-tile__input {
  min-width: 0;
  flex: 1 1 auto;
}

.visual-tag-tile__input :deep(.t-input) {
  min-height: 30px;
  padding-inline: 6px;
  border-color: #d1d5db;
  border-radius: 7px;
  background: #fff;
  box-shadow: none !important;
  font-size: 11px;
}

.visual-tag-tile__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 120ms ease;
}

.visual-tag-tile:hover .visual-tag-tile__actions,
.visual-tag-tile:focus-within .visual-tag-tile__actions,
.visual-tag-tile.is-editing .visual-tag-tile__actions {
  opacity: 1;
}

.visual-tag-tile__action {
  width: 26px;
  height: 26px;
  padding: 6px;
  border-radius: 7px;
  color: #9ca3af;
}

.visual-tag-tile__action.is-danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #dc2626;
}

.visual-tag-tile__action:disabled {
  cursor: default;
  opacity: .5;
}

.visual-tag-tile__action :deep(.t-icon),
.visual-tag-tile__action :deep(.t-loading) {
  font-size: 13px;
}

.visual-tag-manage__load-more {
  padding-top: 14px;
  display: flex;
  justify-content: center;
}

.visual-tag-manage__load-more button {
  min-height: 30px;
  padding: 5px 10px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.visual-tag-manage__load-more button:hover:not(:disabled) {
  background: #f9fafb;
  color: #4b5563;
}

.visual-tag-manage-enter-active,
.visual-tag-manage-leave-active {
  transition: opacity 160ms ease;
}

.visual-tag-manage-enter-from,
.visual-tag-manage-leave-to {
  opacity: 0;
}

@media (max-width: 580px) {
  .visual-tag-manage { width: 100%; }
  .visual-tag-manage__loading,
  .visual-tag-manage__grid { grid-template-columns: 1fr; }
}

@media (hover: none) {
  .visual-tag-tile__actions { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .visual-tag-manage-enter-active,
  .visual-tag-manage-leave-active,
  .visual-tag-tile,
  .visual-tag-tile__actions {
    transition: none !important;
  }
}
</style>

<style lang="less">
/* The drawer is teleported to body, outside the workspace surface that owns
 * most dark-theme selectors. Reuse the global Musuw visual tokens here so the
 * same markup follows the active theme without duplicating a second palette. */
:root[theme-mode="dark"] body .visual-tag-manage__overlay {
  background: rgb(0 0 0 / 48%) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-page) !important;
  color: var(--mvc-text) !important;
  box-shadow: var(--mvc-shadow) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__header {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-page) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__heading-icon,
:root[theme-mode="dark"] body .visual-tag-tile__badge {
  background: var(--mvc-hover) !important;
  color: var(--mvc-muted-strong) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__heading h3,
:root[theme-mode="dark"] body .visual-tag-manage__section-head h4,
:root[theme-mode="dark"] body .visual-tag-tile__copy strong {
  color: var(--mvc-text-strong) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__heading p,
:root[theme-mode="dark"] body .visual-tag-manage__section-head,
:root[theme-mode="dark"] body .visual-tag-tile__copy small,
:root[theme-mode="dark"] body .visual-tag-manage__close,
:root[theme-mode="dark"] body .visual-tag-tile__action,
:root[theme-mode="dark"] body .visual-tag-manage__load-more button {
  color: var(--mvc-muted) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__search .t-input,
:root[theme-mode="dark"] body .visual-tag-tile__input .t-input {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__search .t-input__inner,
:root[theme-mode="dark"] body .visual-tag-tile__input .t-input__inner {
  background: transparent !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__search .t-input__inner::placeholder,
:root[theme-mode="dark"] body .visual-tag-tile__input .t-input__inner::placeholder {
  color: var(--mvc-muted) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__search .t-input:hover,
:root[theme-mode="dark"] body .visual-tag-manage__search .t-input.t-is-focused,
:root[theme-mode="dark"] body .visual-tag-tile__input .t-input.t-is-focused {
  border-color: var(--mvc-line-strong) !important;
  background: var(--mvc-surface-raised) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__create-trigger,
:root[theme-mode="dark"] body .visual-tag-tile {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .visual-tag-manage__content,
:root[theme-mode="dark"] body .visual-tag-manage__empty,
:root[theme-mode="dark"] body .visual-tag-manage__loading {
  background: var(--mvc-page) !important;
  color: var(--mvc-muted) !important;
}

:root[theme-mode="dark"] body .visual-tag-tile:hover:not(.is-editing),
:root[theme-mode="dark"] body .visual-tag-tile.is-editing,
:root[theme-mode="dark"] body .visual-tag-manage__close:hover,
:root[theme-mode="dark"] body .visual-tag-manage__create-trigger:hover:not(:disabled),
:root[theme-mode="dark"] body .visual-tag-tile__action:hover:not(:disabled),
:root[theme-mode="dark"] body .visual-tag-manage__load-more button:hover:not(:disabled) {
  border-color: var(--mvc-line-strong) !important;
  background: var(--mvc-hover) !important;
  color: var(--mvc-text-strong) !important;
}

:root[theme-mode="dark"] body .visual-tag-tile__action.is-danger:hover:not(:disabled) {
  background: rgb(127 29 29 / 28%) !important;
  color: #fca5a5 !important;
}
</style>
