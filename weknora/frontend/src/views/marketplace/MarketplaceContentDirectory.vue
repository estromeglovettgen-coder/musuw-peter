<template>
  <div class="market-content-directory">
    <t-input v-model="query" clearable :placeholder="t('creatorMarketplace.directorySearch')" :aria-label="t('creatorMarketplace.directorySearch')" class="market-directory-search">
      <template #prefix-icon><t-icon name="search" /></template>
    </t-input>
    <div class="market-directory-browser">
      <nav class="market-directory-folders" :aria-label="t('creatorMarketplace.contentsTab')">
        <t-tree :data="folderTree" :actived="[selected]" :expand-level="2" :height="380" :scroll="{ type: 'virtual', rowHeight: 36, threshold: 100 }" hover>
          <template #label="{ node }">
            <button type="button" class="market-directory-folder" :aria-pressed="selected === node.value" :title="node.label" @click.stop="selected = String(node.value)">
              <span>{{ node.label }}</span><small>{{ node.data.count }}</small>
            </button>
          </template>
        </t-tree>
      </nav>
      <section class="market-directory-pages">
        <div class="market-directory-heading"><h2>{{ selectedPath.at(-1) || t('creatorMarketplace.allContent') }}</h2><span>{{ t('creatorMarketplace.directoryCount', { count: filteredEntries.length.toLocaleString(locale) }) }}</span></div>
        <ul v-if="visibleEntries.length" ref="listElement" class="market-directory-titles">
          <li class="market-directory-entry" v-for="entry in visibleEntries" :key="entry.id">
            <t-icon name="file" aria-hidden="true" />
            <div><span class="market-directory-title">{{ entry.title }}</span><small>{{ entry.path.join(' / ') }}</small></div>
          </li>
        </ul>
        <p v-else class="market-detail-empty">{{ t('creatorMarketplace.directoryNoResults') }}</p>
        <t-pagination v-if="filteredEntries.length > pageSize" v-model="page" :total="filteredEntries.length" :page-size="pageSize" :show-page-size="false" :show-jumper="false" :total-content="false" size="small" theme="simple" />
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MarketplaceDirectoryEntry } from '@/api/creator-marketplace'

const props = defineProps<{ entries: MarketplaceDirectoryEntry[] }>()
const { t, locale } = useI18n()
const query = ref('')
const selected = ref('[]')
const page = ref(1)
const pageSize = 30
const listElement = ref<HTMLUListElement | null>(null)
interface DirectoryFolder { value: string; label: string; count: number; children: DirectoryFolder[] }
// Paths come from the published Wiki folder ancestry; no inferred topic groups.
const folderTree = computed(() => {
  const root: DirectoryFolder = { value: '[]', label: t('creatorMarketplace.allContent'), count: props.entries.length, children: [] }
  const folders = new Map<string, DirectoryFolder>([['[]', root]])
  for (const entry of props.entries) {
    let parent = root
    for (let depth = 0; depth < entry.path.length; depth++) {
      const value = JSON.stringify(entry.path.slice(0, depth + 1))
      let folder = folders.get(value)
      if (!folder) {
        folder = { value, label: entry.path[depth], count: 0, children: [] }
        folders.set(value, folder)
        parent.children.push(folder)
      }
      folder.count++
      parent = folder
    }
  }
  return [root]
})
const selectedPath = computed<string[]>(() => JSON.parse(selected.value))
const filteredEntries = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase(locale.value)
  return props.entries.filter(entry => selectedPath.value.every((part, index) => entry.path[index] === part)
    && (!needle || `${entry.title} ${entry.path.join(' ')}`.toLocaleLowerCase(locale.value).includes(needle)))
})
const visibleEntries = computed(() => filteredEntries.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(query, () => { selected.value = '[]'; page.value = 1 })
watch(selected, () => { page.value = 1 })
watch([page, query, selected], async () => { await nextTick(); if (listElement.value) listElement.value.scrollTop = 0 })
watch(() => props.entries, () => { selected.value = '[]'; query.value = ''; page.value = 1 })
</script>
<style scoped lang="less">
.market-content-directory { --td-brand-color: var(--td-text-color-primary); }
.market-directory-search { max-width: 360px; margin-bottom: 22px; }
.market-directory-browser { display: grid; grid-template-columns: minmax(200px, 27%) minmax(0, 1fr); gap: 28px; align-items: start; }
.market-directory-folders { min-width: 0; padding-right: 20px; border-right: 1px solid var(--td-component-stroke); }
.market-directory-folders :deep(.t-tree__label) { min-width: 0; flex: 1; }
.market-directory-folders :deep(.t-tree__item) { min-width: 0; }
.market-directory-folder { display: flex; gap: 12px; align-items: center; width: 100%; min-width: 0; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--td-text-color-secondary); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.market-directory-folder span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.market-directory-folder small { margin-left: auto; font-size: 11px; color: var(--td-text-color-placeholder); }
.market-directory-folder[aria-pressed="true"] { background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-primary); font-weight: 600; }
.market-directory-folder:focus-visible { outline: 2px solid var(--td-text-color-primary); outline-offset: -2px; }
.market-directory-pages { min-width: 0; }
.market-directory-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
.market-directory-heading h2 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.market-directory-heading > span { font-size: 12px; color: var(--td-text-color-secondary); }
.market-directory-titles { list-style: none; padding: 0 8px 0 0; margin: 0 0 20px; max-height: 380px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.market-directory-titles li { display: flex; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--td-component-stroke); }
.market-directory-titles .t-icon { flex-shrink: 0; margin-top: 3px; color: var(--td-text-color-placeholder); }
.market-directory-titles li > div { min-width: 0; }
.market-directory-title { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.market-directory-titles small { display: block; margin-top: 3px; font-size: 11px; line-height: 1.6; color: var(--td-text-color-placeholder); overflow-wrap: anywhere; }
@media(max-width: 760px) {
  .market-directory-search { max-width: none; }
  .market-directory-browser { grid-template-columns: minmax(0, 1fr); gap: 22px; }
  .market-directory-folders { padding: 0 0 18px; border-right: 0; border-bottom: 1px solid var(--td-component-stroke); }
  .market-directory-folders :deep(.t-tree) { max-height: 180px; }
}
</style>
