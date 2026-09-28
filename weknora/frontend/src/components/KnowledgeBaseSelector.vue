<template>
  <Teleport to="body">
    <div v-if="visible" class="visual-kb-selector__overlay" @click="close">
      <section
        class="visual-kb-selector"
        role="dialog"
        :aria-label="$t('knowledgeBase.searchPlaceholder')"
        :style="dropdownStyle"
        @click.stop
        @wheel.stop
      >
        <div class="visual-kb-selector__search">
          <t-icon name="search" aria-hidden="true" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            :placeholder="$t('knowledgeBase.searchPlaceholder')"
            @keydown.down.prevent="moveSelection(1)"
            @keydown.up.prevent="moveSelection(-1)"
            @keydown.enter.prevent="toggleSelection"
            @keydown.esc="close"
          />
        </div>

        <div ref="kbList" class="visual-kb-selector__list" role="listbox" @wheel.stop>
          <button
            v-for="(kb, index) in filteredKnowledgeBases"
            :key="kb.id"
            type="button"
            class="visual-kb-option"
            :class="{
              'is-selected': isSelected(kb.id),
              'is-highlighted': highlightedIndex === index,
            }"
            role="option"
            :aria-selected="isSelected(kb.id)"
            @click="toggleKb(kb.id)"
            @mouseenter="highlightedIndex = index"
          >
            <span class="visual-kb-option__check" aria-hidden="true">
              <t-icon v-if="isSelected(kb.id)" name="check" />
            </span>
            <span class="visual-kb-option__icon" :class="{ 'is-faq': kb.type === 'faq' }" aria-hidden="true">
              <t-icon :name="kb.type === 'faq' ? 'help-circle' : 'folder'" />
            </span>
            <span class="visual-kb-option__copy">
              <strong :title="kb.name">{{ kb.name }}</strong>
              <small>
                {{ kb.type === 'faq'
                  ? (kb.chunk_count || 0)
                  : (kb.knowledge_count || 0) }}
              </small>
            </span>
          </button>

          <div v-if="filteredKnowledgeBases.length === 0" class="visual-kb-selector__empty">
            <t-icon name="search" />
            <span>{{ searchQuery ? $t('knowledgeBase.noMatch') : $t('knowledgeBase.noKnowledge') }}</span>
          </div>
        </div>

        <footer class="visual-kb-selector__footer">
          <span class="visual-kb-selector__selected-count">{{ selectedKbIds.length }}</span>
          <span class="visual-kb-selector__footer-actions">
            <button type="button" @click="selectAll">{{ $t('common.selectAll') }}</button>
            <button type="button" @click="clearAll">{{ $t('common.clear') }}</button>
          </span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { listKnowledgeBases } from '@/api/knowledge-base'
import { useI18n } from 'vue-i18n'
import { getRootZoom, rectToCssPx, cssViewportSize } from '@/utils/zoom'
import { isKnowledgeBaseRuntimeReady } from '@/utils/knowledgeBaseRuntime'

interface KnowledgeBase {
  id: string
  name: string
  type?: 'document' | 'faq'
  knowledge_count?: number
  chunk_count?: number
  embedding_model_id?: string
  summary_model_id?: string
  capabilities?: { ready?: boolean }
  indexing_strategy?: {
    vector_enabled?: boolean
    keyword_enabled?: boolean
    wiki_enabled?: boolean
  }
}

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
  anchorEl?: any | null
  dropdownWidth?: number
  offsetY?: number
}>()

const emit = defineEmits(['close', 'update:visible'])
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const highlightedIndex = ref(0)
const knowledgeBases = ref<KnowledgeBase[]>([])
const searchInput = ref<HTMLInputElement | null>(null)
const kbList = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

const dropdownWidth = props.dropdownWidth ?? 300
const offsetY = props.offsetY ?? 8

const filteredKnowledgeBases = computed(() => {
  const valid = knowledgeBases.value.filter(isKnowledgeBaseRuntimeReady)
  if (!searchQuery.value) return valid
  const q = searchQuery.value.toLowerCase()
  return valid.filter(k => k.name.toLowerCase().includes(q))
})

const selectedKbIds = computed(() => settingsStore.settings.selectedKnowledgeBases || [])

const resolveAnchorEl = () => {
  const a = props.anchorEl
  if (!a) return null
  if (typeof a === 'object' && 'value' in a) return a.value ?? null
  if (typeof a === 'object' && '$el' in a) return a.$el ?? null
  return a
}

const isSelected = (id: string) => selectedKbIds.value.includes(id)

const toggleKb = (id: string) => {
  isSelected(id) ? settingsStore.removeKnowledgeBase(id) : settingsStore.addKnowledgeBase(id)
}

const toggleSelection = () => {
  const kb = filteredKnowledgeBases.value[highlightedIndex.value]
  if (kb) toggleKb(kb.id)
}

const moveSelection = (dir: number) => {
  const max = filteredKnowledgeBases.value.length
  if (max === 0) return
  highlightedIndex.value = Math.max(0, Math.min(max - 1, highlightedIndex.value + dir))
  nextTick(() => {
    const items = kbList.value?.querySelectorAll('.visual-kb-option')
    items?.[highlightedIndex.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

const selectAll = () => settingsStore.selectKnowledgeBases(filteredKnowledgeBases.value.map(k => k.id))
const clearAll = () => settingsStore.clearKnowledgeBases()

const close = () => {
  emit('update:visible', false)
  emit('close')
}

const loadKnowledgeBases = async () => {
  try {
    const res: any = await listKnowledgeBases()
    if (res?.data && Array.isArray(res.data)) knowledgeBases.value = res.data
  } catch (e) {
    console.error(t('knowledgeBase.loadingFailed'), e)
  }
}

const updateDropdownPosition = () => {
  const anchor = resolveAnchorEl()
  const zoom = getRootZoom()
  const { width: vwFallback, height: vhFallback } = cssViewportSize(zoom)

  const applyFallback = () => {
    const topFallback = Math.max(80, vhFallback / 2 - 160)
    dropdownStyle.value = {
      position: 'fixed',
      width: `${dropdownWidth}px`,
      left: `${Math.round((vwFallback - dropdownWidth) / 2)}px`,
      top: `${Math.round(topFallback)}px`,
      transform: 'none',
      margin: '0',
      padding: '0',
    }
  }

  if (!anchor) {
    applyFallback()
    return
  }

  let rawRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } | null = null
  try {
    if (typeof anchor.getBoundingClientRect === 'function') {
      const r = anchor.getBoundingClientRect()
      rawRect = { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    } else if (anchor.width !== undefined && anchor.left !== undefined) {
      rawRect = anchor as DOMRect
    }
  } catch (e) {
    console.error('[KnowledgeBaseSelector] Error getting bounding rect:', e)
  }

  if (!rawRect || rawRect.width === 0 || rawRect.height === 0) {
    applyFallback()
    return
  }

  const rect = rectToCssPx(rawRect, zoom)
  const vw = vwFallback
  const vh = vhFallback
  let left = Math.floor(rect.left)
  const minLeft = 16
  const maxLeft = Math.max(16, vw - dropdownWidth - 16)
  left = Math.max(minLeft, Math.min(maxLeft, left))

  const preferredDropdownHeight = 280
  const minDropdownHeight = 200
  const topMargin = 20
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top

  let actualHeight: number
  let shouldOpenBelow: boolean

  if (spaceBelow >= minDropdownHeight + offsetY) {
    actualHeight = Math.min(preferredDropdownHeight, spaceBelow - offsetY - 16)
    shouldOpenBelow = true
  } else {
    const availableHeight = spaceAbove - offsetY - topMargin
    actualHeight = availableHeight >= preferredDropdownHeight
      ? preferredDropdownHeight
      : Math.max(minDropdownHeight, availableHeight)
    shouldOpenBelow = false
  }

  if (shouldOpenBelow) {
    dropdownStyle.value = {
      position: 'fixed',
      width: `${dropdownWidth}px`,
      left: `${left}px`,
      top: `${Math.floor(rect.bottom + offsetY)}px`,
      maxHeight: `${actualHeight}px`,
      transform: 'none',
      margin: '0',
      padding: '0',
    }
  } else {
    dropdownStyle.value = {
      position: 'fixed',
      width: `${dropdownWidth}px`,
      left: `${left}px`,
      bottom: `${vh - rect.top + offsetY}px`,
      maxHeight: `${actualHeight}px`,
      transform: 'none',
      margin: '0',
      padding: '0',
    }
  }
}

let resizeHandler: (() => void) | null = null
let scrollHandler: (() => void) | null = null

watch(() => props.visible, async (v) => {
  if (v) {
    await loadKnowledgeBases()
    await nextTick()
    requestAnimationFrame(() => {
      updateDropdownPosition()
      requestAnimationFrame(() => {
        updateDropdownPosition()
        setTimeout(() => updateDropdownPosition(), 50)
      })
    })
    nextTick(() => searchInput.value?.focus())
    resizeHandler = () => updateDropdownPosition()
    scrollHandler = () => updateDropdownPosition()
    window.addEventListener('resize', resizeHandler, { passive: true })
    window.addEventListener('scroll', scrollHandler, { passive: true, capture: true })
  } else {
    searchQuery.value = ''
    highlightedIndex.value = 0
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler)
      resizeHandler = null
    }
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler, { capture: true })
      scrollHandler = null
    }
  }
})
</script>

<style scoped lang="less">
.visual-kb-selector__overlay {
  position: fixed;
  inset: 0;
  z-index: 2900;
  background: transparent;
}

.visual-kb-selector {
  z-index: 2901;
  min-width: 220px;
  max-width: calc(100vw - 32px);
  max-height: min(360px, calc(100vh - 32px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 14px 34px rgb(15 23 42 / 14%);
  color: #374151;
}

.visual-kb-selector__search {
  flex: 0 0 auto;
  margin: 7px;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: #f9fafb;
  color: #9ca3af;
}

.visual-kb-selector__search :deep(.t-icon) {
  flex: 0 0 13px;
  font-size: 13px;
}

.visual-kb-selector__search input {
  min-width: 0;
  flex: 1 1 auto;
  border: 0;
  outline: 0;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 11px;
  line-height: 18px;
}

.visual-kb-selector__search input::placeholder {
  color: #9ca3af;
}

.visual-kb-selector__list {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 5px 5px;
  scrollbar-width: thin;
}

.visual-kb-option {
  width: 100%;
  min-height: 38px;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  color: #4b5563;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.visual-kb-option:hover,
.visual-kb-option.is-highlighted {
  background: #f9fafb;
  color: #111827;
}

.visual-kb-option.is-selected {
  background: #f3f4f6;
  color: #111827;
}

.visual-kb-option__check {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #fff;
}

.visual-kb-option.is-selected .visual-kb-option__check {
  border-color: #111827;
  background: #111827;
}

.visual-kb-option__check :deep(.t-icon) {
  font-size: 10px;
}

.visual-kb-option__icon {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
}

.visual-kb-option__icon.is-faq {
  background: #f9fafb;
  color: #4b5563;
}

.visual-kb-option__icon :deep(.t-icon) {
  font-size: 13px;
}

.visual-kb-option__copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.visual-kb-option__copy strong {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: 11px;
  line-height: 17px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-kb-option__copy small {
  flex: 0 0 auto;
  color: #9ca3af;
  font-size: 9px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
}

.visual-kb-selector__empty {
  min-height: 96px;
  padding: 18px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #9ca3af;
  font-size: 11px;
  text-align: center;
}

.visual-kb-selector__empty :deep(.t-icon) {
  font-size: 18px;
  color: #d1d5db;
}

.visual-kb-selector__footer {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 6px 8px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
}

.visual-kb-selector__selected-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.visual-kb-selector__footer-actions {
  display: flex;
  gap: 2px;
}

.visual-kb-selector__footer button {
  min-height: 26px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}

.visual-kb-selector__footer button:hover {
  background: #f3f4f6;
  color: #111827;
}
</style>
