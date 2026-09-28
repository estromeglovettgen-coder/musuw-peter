<template>
  <section class="visual-folder-picker" :aria-label="t('knowledgeBase.moveToFolder.action')">
    <button
      v-if="showBack"
      type="button"
      class="visual-folder-picker__back"
      @click.stop="emit('back')"
    >
      <t-icon name="chevron-left" />
      <span>{{ t('knowledgeBase.moveToFolder.action') }}</span>
    </button>

    <div ref="listRef" class="visual-folder-picker__list">
      <template v-for="row in renderRows" :key="row.key">
        <div
          v-if="row.kind === 'folder'"
          :data-folder-path="row.path || undefined"
          class="visual-folder-picker__row"
          :class="{ 'is-current': effectiveCurrentPath === row.path }"
          :style="{ '--visual-folder-depth': row.depth }"
          :title="row.path || undefined"
        >
          <button
            type="button"
            class="visual-folder-picker__select"
            :aria-current="effectiveCurrentPath === row.path ? 'true' : undefined"
            @click.stop="choose(row.path)"
          >
            <t-icon :name="row.isRoot ? 'folder-open' : 'folder'" class="visual-folder-picker__folder-icon" />
            <span class="visual-folder-picker__name">{{ row.label }}</span>
            <t-icon v-if="effectiveCurrentPath === row.path" name="check" class="visual-folder-picker__check" />
          </button>

          <button
            type="button"
            class="visual-folder-picker__create-button"
            :title="row.isRoot
              ? t('knowledgeBase.moveToFolder.newFolderAddRoot')
              : t('knowledgeBase.moveToFolder.newFolderAddUnder', { folder: row.label })"
            :aria-label="row.isRoot
              ? t('knowledgeBase.moveToFolder.newFolderAddRoot')
              : t('knowledgeBase.moveToFolder.newFolderAddUnder', { folder: row.label })"
            @click.stop="startCreatingUnder(row.path)"
          >
            <t-icon name="folder-add" />
          </button>
        </div>

        <div
          v-else
          class="visual-folder-picker__create-row"
          :style="{ '--visual-folder-depth': row.depth }"
          @click.stop
        >
          <t-icon name="folder" class="visual-folder-picker__folder-icon" />
          <input
            ref="newFolderInputRef"
            v-model.trim="newFolderName"
            class="visual-folder-picker__input"
            :placeholder="t('knowledgeBase.moveToFolder.newFolderPlaceholder')"
            @keydown.enter.stop="commitNewFolder"
            @keydown.esc.stop="cancelCreating"
          />
          <button
            type="button"
            class="visual-folder-picker__cancel-create"
            :aria-label="t('common.cancel')"
            @click.stop="cancelCreating"
          >
            <t-icon name="close" />
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { folderOptionFromPath, joinFolderPath, normalizeFolderPath, sortFolderOptions } from '../folderTree'

export type FolderOption = { path: string; name: string; depth: number }

type FolderRow = {
  kind: 'folder'
  key: string
  path: string
  label: string
  depth: number
  isRoot?: boolean
}

type CreateRow = {
  kind: 'create'
  key: string
  parentPath: string
  depth: number
}

type RenderRow = FolderRow | CreateRow

const props = withDefaults(defineProps<{
  options: FolderOption[]
  currentPath?: string
  showBack?: boolean
  allowReselect?: boolean
}>(), {
  currentPath: '',
  showBack: false,
  allowReselect: false,
})

const emit = defineEmits<{
  back: []
  confirm: [folderPath: string]
  create: [folderPath: string]
}>()

const { t } = useI18n()

const creatingUnder = ref<string | null>(null)
const newFolderName = ref('')
const newFolderInputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const localCreatedPaths = ref<string[]>([])
const selectedPath = ref<string | null>(null)

const effectiveCurrentPath = computed(() =>
  selectedPath.value !== null ? selectedPath.value : (props.currentPath ?? ''),
)

const displayOptions = computed(() => {
  const byPath = new Map<string, FolderOption>()
  props.options.forEach((option) => byPath.set(option.path, option))
  localCreatedPaths.value.forEach((path) => {
    if (!byPath.has(path)) byPath.set(path, folderOptionFromPath(path))
  })
  return sortFolderOptions([...byPath.values()])
})

const renderRows = computed<RenderRow[]>(() => {
  const rows: RenderRow[] = [{
    kind: 'folder',
    key: 'root',
    path: '',
    label: t('knowledgeBase.folderTree.rootRow'),
    depth: 0,
    isRoot: true,
  }]

  if (creatingUnder.value === '') {
    rows.push({
      kind: 'create',
      key: 'create-root',
      parentPath: '',
      depth: childCreateDepth(''),
    })
  }

  displayOptions.value.forEach((option) => {
    rows.push({
      kind: 'folder',
      key: option.path,
      path: option.path,
      label: option.name,
      depth: option.depth,
    })
    if (creatingUnder.value === option.path) {
      rows.push({
        kind: 'create',
        key: `create-${option.path}`,
        parentPath: option.path,
        depth: childCreateDepth(option.path),
      })
    }
  })

  return rows
})

watch(
  creatingUnder,
  async (value) => {
    if (value === null) return
    await nextTick()
    newFolderInputRef.value?.focus()
  },
)

watch(
  () => props.options,
  (options) => {
    const existing = new Set(options.map((option) => option.path))
    localCreatedPaths.value = localCreatedPaths.value.filter((path) => !existing.has(path))
  },
  { deep: true },
)

watch(
  () => props.currentPath,
  () => {
    selectedPath.value = null
  },
)

function childCreateDepth(parentPath: string): number {
  return parentPath.split('/').filter(Boolean).length
}

const choose = (path: string) => {
  if (path === effectiveCurrentPath.value && !props.allowReselect) return
  selectedPath.value = path
  emit('confirm', path)
}

const startCreatingUnder = (parentPath: string) => {
  if (creatingUnder.value === parentPath) {
    cancelCreating()
    return
  }
  creatingUnder.value = parentPath
  newFolderName.value = ''
}

const cancelCreating = () => {
  creatingUnder.value = null
  newFolderName.value = ''
}

const scrollToFolder = async (path: string) => {
  await nextTick()
  const row = listRef.value?.querySelector(`[data-folder-path="${CSS.escape(path)}"]`)
  row?.scrollIntoView({ block: 'nearest' })
}

const commitNewFolder = async () => {
  if (creatingUnder.value === null) return
  const name = normalizeFolderPath(newFolderName.value)
  if (!name) return
  const path = joinFolderPath(creatingUnder.value, name)
  if (displayOptions.value.some((option) => option.path === path)) {
    MessagePlugin.warning(t('knowledgeBase.moveToFolder.duplicate'))
    return
  }

  if (!localCreatedPaths.value.includes(path)) {
    localCreatedPaths.value = [...localCreatedPaths.value, path]
  }
  creatingUnder.value = null
  newFolderName.value = ''
  emit('create', path)
  await scrollToFolder(path)
}
</script>

<style scoped lang="less">
.visual-folder-picker {
  --visual-folder-indent: 14px;
  width: 288px;
  max-width: min(288px, calc(100vw - 32px));
  max-height: 256px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  color: #374151;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.visual-folder-picker__back {
  width: 100%;
  min-height: 36px;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 12px;
  border: 0;
  border-bottom: 1px solid #f3f4f6;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.visual-folder-picker__back:hover {
  background: #f9fafb;
  color: #111827;
}

.visual-folder-picker__back :deep(.t-icon) {
  font-size: 14px;
}

.visual-folder-picker__back span {
  flex: 0 0 auto;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.visual-folder-picker__list {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px;
  scrollbar-width: thin;
}

.visual-folder-picker__row,
.visual-folder-picker__create-row {
  width: 100%;
  min-height: 36px;
  box-sizing: border-box;
  padding-left: calc(var(--visual-folder-depth, 0) * var(--visual-folder-indent));
  display: flex;
  align-items: center;
  gap: 4px;
}

.visual-folder-picker__row {
  border-radius: 12px;
}

.visual-folder-picker__row:hover {
  background: #f9fafb;
}

.visual-folder-picker__row.is-current {
  background: #f3f4f6;
}

.visual-folder-picker__select {
  min-width: 0;
  min-height: 36px;
  flex: 1 1 auto;
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
}

.visual-folder-picker__row.is-current .visual-folder-picker__select {
  color: #111827;
  font-weight: 700;
}

.visual-folder-picker__folder-icon {
  flex: 0 0 15px;
  width: 15px;
  height: 15px;
  font-size: 15px;
  color: #9ca3af;
}

.visual-folder-picker__name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-folder-picker__check {
  flex: 0 0 13px;
  width: 13px;
  height: 13px;
  color: #4b5563;
  font-size: 13px;
}

.visual-folder-picker__create-button,
.visual-folder-picker__cancel-create {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  padding: 5px;
  border: 0;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  opacity: 0;
  transition: opacity 140ms ease, background-color 140ms ease, color 140ms ease;
}

.visual-folder-picker__row:hover .visual-folder-picker__create-button,
.visual-folder-picker__create-button:focus-visible {
  opacity: 1;
}

.visual-folder-picker__create-button:hover,
.visual-folder-picker__cancel-create:hover {
  background: #f3f4f6;
  color: #374151;
}

.visual-folder-picker__create-row {
  padding-right: 4px;
  padding-block: 4px;
}

.visual-folder-picker__create-row .visual-folder-picker__folder-icon {
  margin-left: 8px;
}

.visual-folder-picker__input {
  min-width: 0;
  height: 30px;
  flex: 1 1 auto;
  box-sizing: border-box;
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  outline: none;
}

.visual-folder-picker__input:focus {
  border-color: #9ca3af;
  box-shadow: 0 0 0 2px rgb(17 24 39 / 6%);
}

.visual-folder-picker__create-row .visual-folder-picker__cancel-create {
  opacity: 1;
}

@media (min-width: 640px) {
  .visual-folder-picker__back,
  .visual-folder-picker__select,
  .visual-folder-picker__input {
    font-size: 14px;
    line-height: 20px;
  }
}

/* Dark mode keeps the selected row on the shared semantic hover token. */
:global(:root[theme-mode="dark"] body .visual-folder-picker__row.is-current) {
  background: var(--mvc-hover) !important;
}

:global(:root[theme-mode="dark"] body .visual-folder-picker__back) {
  border-bottom-color: var(--mvc-line) !important;
}

@media (prefers-reduced-motion: reduce) {
  .visual-folder-picker__create-button,
  .visual-folder-picker__cancel-create {
    transition: none !important;
  }
}
</style>
