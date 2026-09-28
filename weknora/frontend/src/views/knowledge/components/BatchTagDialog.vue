<template>
  <Teleport to="body">
    <Transition name="visual-batch-tag">
      <div v-if="visible" class="visual-batch-tag__overlay" role="presentation">
        <section
          class="visual-batch-tag"
          role="dialog"
          aria-modal="true"
          :aria-label="$t('knowledgeBase.batchTagDialogHeading')"
        >
          <header class="visual-batch-tag__header">
            <div class="visual-batch-tag__heading">
              <span class="visual-batch-tag__heading-icon" aria-hidden="true">
                <t-icon name="discount" />
              </span>
              <div class="visual-batch-tag__heading-copy">
                <h3>{{ $t('knowledgeBase.batchTagDialogHeading') }}</h3>
                <p>{{ $t('knowledgeBase.batchTagSubtitle', { count }) }}</p>
              </div>
            </div>
            <button
              type="button"
              class="visual-batch-tag__close"
              :aria-label="$t('common.cancel')"
              @click="handleClose"
            >
              <t-icon name="close" />
            </button>
          </header>

          <div class="visual-batch-tag__body">
            <section class="visual-batch-tag__section">
              <div class="visual-batch-tag__section-head">
                <h4>{{ $t('knowledgeBase.batchTagSelectedSection') }}</h4>
                <button
                  v-if="selectedSet.size > 0"
                  type="button"
                  class="visual-batch-tag__text-action"
                  @click="clearAll"
                >
                  {{ $t('knowledgeBase.tagClearAction') }}
                </button>
              </div>

              <div v-if="selectedTagsList.length > 0" class="visual-batch-tag__chips">
                <button
                  v-for="tag in selectedTagsList"
                  :key="tag.id"
                  type="button"
                  class="visual-batch-tag__chip is-selected"
                  :title="tag.name"
                  @click="toggleTag(tag.id)"
                >
                  <span>{{ tag.name }}</span>
                  <t-icon name="close" />
                </button>
              </div>
              <p v-else class="visual-batch-tag__empty">{{ $t('knowledgeBase.batchTagNoSelected') }}</p>
            </section>

            <section class="visual-batch-tag__section">
              <div class="visual-batch-tag__section-head">
                <h4>{{ $t('knowledgeBase.batchTagAvailableSection') }}</h4>
                <button
                  v-if="canManage"
                  type="button"
                  class="visual-batch-tag__text-action"
                  @click="handleOpenManage"
                >
                  {{ $t('knowledgeBase.tagManageLink') }}
                </button>
              </div>

              <div class="visual-batch-tag__search">
                <t-input
                  v-model="searchQuery"
                  :placeholder="$t('knowledgeBase.tagEditSearch')"
                  clearable
                  size="small"
                >
                  <template #prefix-icon><t-icon name="search" size="14px" /></template>
                </t-input>
              </div>

              <div v-if="availableTagsList.length > 0" class="visual-batch-tag__chips is-scrollable">
                <button
                  v-for="tag in availableTagsList"
                  :key="tag.id"
                  type="button"
                  class="visual-batch-tag__chip"
                  :title="tag.knowledge_count !== undefined ? `${tag.name} (${tag.knowledge_count})` : tag.name"
                  @click="toggleTag(tag.id)"
                >
                  {{ tag.name }}
                </button>
              </div>

              <div v-else class="visual-batch-tag__empty-row">
                <span>{{ searchQuery.trim() ? $t('knowledgeBase.tagEmptyResult') : $t('knowledgeBase.noTags') }}</span>
                <button
                  v-if="searchQuery.trim()"
                  type="button"
                  class="visual-batch-tag__text-action"
                  :disabled="creatingTag"
                  @click="handleCreateTag"
                >
                  <t-loading v-if="creatingTag" size="small" />
                  <span>{{ $t('knowledgeBase.tagCreateAction') }} “{{ searchQuery.trim() }}”</span>
                </button>
              </div>

              <div class="visual-batch-tag__create-row">
                <t-input
                  v-model="newTagName"
                  :placeholder="$t('knowledgeBase.tagNewPlaceholder')"
                  size="small"
                  :maxlength="40"
                  :disabled="creatingTag"
                  @enter="handleAddNewTag"
                />
                <button
                  type="button"
                  class="visual-batch-tag__create-button"
                  :disabled="creatingTag || !newTagName.trim()"
                  @click="handleAddNewTag"
                >
                  <t-loading v-if="creatingTag" size="small" />
                  <t-icon v-else name="add" />
                  <span>{{ $t('knowledgeBase.tagCreateAction') }}</span>
                </button>
              </div>
            </section>
          </div>

          <footer class="visual-batch-tag__footer">
            <span>{{ $t('knowledgeBase.tagSelectedCount', { count: selectedSet.size }) }}</span>
            <div class="visual-batch-tag__footer-actions">
              <button
                type="button"
                class="visual-batch-tag__button"
                :disabled="confirmLoading"
                @click="handleClose"
              >
                {{ $t('common.cancel') }}
              </button>
              <button
                type="button"
                class="visual-batch-tag__button is-primary"
                :disabled="confirmLoading"
                @click="handleConfirm"
              >
                <t-loading v-if="confirmLoading" size="small" />
                <span>{{ $t('common.confirm') }}</span>
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessagePlugin } from 'tdesign-vue-next';
import { createKnowledgeBaseTag } from '@/api/knowledge-base';

interface Tag {
  id: string;
  name: string;
  color?: string;
  knowledge_count?: number;
}

const props = defineProps<{
  visible: boolean;
  count: number;
  kbId: string;
  tagList: Tag[];
  preSelectedTagIds?: string[];
  canManage?: boolean;
  confirmLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', tagIds: string[]): void;
  (e: 'tag-created'): void;
  (e: 'open-manage'): void;
}>();

const { t } = useI18n();

const searchQuery = ref('');
const selectedSet = ref<Set<string>>(new Set());
const creatingTag = ref(false);
const newTagName = ref('');

watch(
  () => props.visible,
  (val) => {
    if (val) {
      selectedSet.value = new Set(props.preSelectedTagIds ?? []);
      searchQuery.value = '';
      newTagName.value = '';
    }
  },
);

const tagMap = computed(() => new Map(props.tagList.map((tag) => [tag.id, tag])));

const selectedTagsList = computed(() => {
  return Array.from(selectedSet.value)
    .map((id) => tagMap.value.get(id))
    .filter((tag): tag is Tag => Boolean(tag));
});

const availableTagsList = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return props.tagList.filter((tag) => {
    if (selectedSet.value.has(tag.id)) return false;
    if (query && !(tag.name || '').toLowerCase().includes(query)) return false;
    return true;
  });
});

function toggleTag(tagId: string) {
  const next = new Set(selectedSet.value);
  if (next.has(tagId)) {
    next.delete(tagId);
  } else {
    next.add(tagId);
  }
  selectedSet.value = next;
}

function clearAll() {
  selectedSet.value = new Set();
}

async function handleCreateTag() {
  const name = searchQuery.value.trim();
  if (!name) return;
  creatingTag.value = true;
  try {
    const res: any = await createKnowledgeBaseTag(props.kbId, { name });
    const newTag = res?.data || res;
    const next = new Set(selectedSet.value);
    next.add(newTag.id);
    selectedSet.value = next;
    searchQuery.value = '';
    emit('tag-created');
    MessagePlugin.success(t('knowledgeBase.tagCreateSuccess'));
  } catch (error: any) {
    MessagePlugin.error(error?.message || t('common.operationFailed'));
  } finally {
    creatingTag.value = false;
  }
}

async function handleAddNewTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  const exists = props.tagList.find((t) => t.name === name);
  if (exists) {
    const next = new Set(selectedSet.value);
    next.add(exists.id);
    selectedSet.value = next;
    newTagName.value = '';
    return;
  }
  creatingTag.value = true;
  try {
    const res: any = await createKnowledgeBaseTag(props.kbId, { name });
    const newTag = res?.data || res;
    const next = new Set(selectedSet.value);
    next.add(newTag.id);
    selectedSet.value = next;
    newTagName.value = '';
    emit('tag-created');
    MessagePlugin.success(t('knowledgeBase.tagCreateSuccess'));
  } catch (error: any) {
    MessagePlugin.error(error?.message || t('common.operationFailed'));
  } finally {
    creatingTag.value = false;
  }
}

function handleConfirm() {
  if (props.confirmLoading) return;
  emit('confirm', Array.from(selectedSet.value));
}

function handleClose() {
  emit('update:visible', false);
}

function handleOpenManage() {
  emit('update:visible', false);
  emit('open-manage');
}
</script>

<style scoped>
.visual-batch-tag__overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 34%);
  backdrop-filter: blur(3px);
}

.visual-batch-tag {
  width: min(460px, 100%);
  max-height: min(720px, calc(100dvh - 40px));
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  background: #fff;
  color: #1f2937;
  box-shadow: 0 24px 60px rgb(0 0 0 / 18%);
}

.visual-batch-tag__header {
  padding: 18px 18px 14px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.visual-batch-tag__heading {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.visual-batch-tag__heading-icon {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
}

.visual-batch-tag__heading-copy h3 {
  margin: 0;
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
}

.visual-batch-tag__heading-copy p {
  margin: 2px 0 0;
  color: #9ca3af;
  font-size: 11px;
  line-height: 16px;
}

.visual-batch-tag__close {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 6px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}

.visual-batch-tag__close:hover:not(:disabled) {
  background: #f3f4f6;
  color: #374151;
}

.visual-batch-tag__body {
  min-height: 0;
  overflow-y: auto;
  padding: 0 18px;
}

.visual-batch-tag__section {
  padding: 16px 0;
  border-bottom: 1px solid #f3f4f6;
}

.visual-batch-tag__section:last-child {
  border-bottom: 0;
}

.visual-batch-tag__section-head {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.visual-batch-tag__section-head h4 {
  margin: 0;
  color: #374151;
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.visual-batch-tag__text-action {
  padding: 3px 4px;
  border: 0;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}

.visual-batch-tag__text-action:hover:not(:disabled) {
  background: #f9fafb;
  color: #4b5563;
}

.visual-batch-tag__text-action:disabled,
.visual-batch-tag__close:disabled {
  cursor: default;
  opacity: .5;
}

.visual-batch-tag__search {
  margin-bottom: 10px;
}

.visual-batch-tag__search :deep(.t-input),
.visual-batch-tag__create-row :deep(.t-input) {
  min-height: 34px;
  border-color: #e5e7eb;
  border-radius: 9px;
  background: #f9fafb;
  box-shadow: none !important;
  font-size: 12px;
}

.visual-batch-tag__search :deep(.t-input.t-is-focused),
.visual-batch-tag__create-row :deep(.t-input.t-is-focused) {
  border-color: #d1d5db;
  background: #fff;
}

.visual-batch-tag__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.visual-batch-tag__chips.is-scrollable {
  max-height: 150px;
  overflow-y: auto;
}

.visual-batch-tag__chip {
  max-width: 100%;
  min-height: 28px;
  padding: 5px 9px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #fff;
  color: #6b7280;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}

.visual-batch-tag__chip:hover:not(:disabled) {
  border-color: #d1d5db;
  background: #f9fafb;
  color: #374151;
}

.visual-batch-tag__chip.is-selected {
  border-color: #d1d5db;
  background: #f3f4f6;
  color: #111827;
  font-weight: 600;
}

.visual-batch-tag__chip:disabled {
  cursor: default;
  opacity: .58;
}

.visual-batch-tag__chip :deep(.t-icon) {
  width: 11px;
  height: 11px;
  font-size: 11px;
  color: #9ca3af;
}

.visual-batch-tag__empty,
.visual-batch-tag__empty-row {
  margin: 0;
  color: #9ca3af;
  font-size: 11px;
  line-height: 18px;
}

.visual-batch-tag__empty-row {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.visual-batch-tag__create-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.visual-batch-tag__create-row :deep(.t-input__wrap) {
  min-width: 0;
  flex: 1 1 auto;
}

.visual-batch-tag__create-button {
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #fff;
  color: #4b5563;
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
  cursor: pointer;
}

.visual-batch-tag__create-button:hover:not(:disabled) {
  background: #f9fafb;
  color: #111827;
}

.visual-batch-tag__create-button:disabled {
  cursor: default;
  opacity: .45;
}

.visual-batch-tag__footer {
  padding: 13px 18px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f9fafb;
  color: #9ca3af;
  font-size: 11px;
}

.visual-batch-tag__footer-actions {
  display: flex;
  gap: 7px;
}

.visual-batch-tag__button {
  min-height: 34px;
  padding: 7px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  color: #4b5563;
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
  cursor: pointer;
}

.visual-batch-tag__button.is-primary {
  border-color: #111827;
  background: #111827;
  color: #fff;
}

.visual-batch-tag__button:disabled {
  cursor: default;
  opacity: .55;
}

.visual-batch-tag-enter-active,
.visual-batch-tag-leave-active {
  transition: opacity 150ms ease;
}

.visual-batch-tag-enter-from,
.visual-batch-tag-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .visual-batch-tag__overlay { padding: 12px; }
  .visual-batch-tag { max-height: calc(100dvh - 24px); }
}

@media (prefers-reduced-motion: reduce) {
  .visual-batch-tag-enter-active,
  .visual-batch-tag-leave-active {
    transition: none !important;
  }
}
</style>
