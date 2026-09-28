<template>
  <Teleport to="body" :disabled="!useOverlay">
    <Transition name="visual-references-panel" @after-enter="handlePanelAfterEnter">
      <aside v-if="visible" class="visual-references-panel" :class="{ 'is-overlay': useOverlay, 'is-embedded': embeddedMode }" role="complementary" :aria-label="panelTitle">
        <header class="visual-references-panel__header">
          <div class="visual-references-panel__heading">
            <h3><span>{{ panelTitle }}</span><span class="visual-references-panel__dot">·</span><span class="visual-references-panel__count">{{ totalCount || 0 }}</span></h3>
          </div>
          <button type="button" class="visual-references-panel__close" :aria-label="t('common.close')" @click="close"><t-icon name="close" /></button>
        </header>

        <div ref="listElement" class="visual-references-panel__body">
          <div v-if="sections.length === 0" class="visual-references-panel__empty">
            <t-icon name="star" /><p>{{ t('chat.referencesDrawerEmpty') }}</p>
          </div>

          <section v-for="section in sections" :key="section.id" class="visual-reference-section">
            <h4>{{ sectionTitle(section.id) }}</h4>
            <article v-for="item in section.items" :key="item.key" :ref="(el) => setItemRef(item.key, el as HTMLElement | null)" class="visual-reference-item" :class="[`is-${item.kind}`, { 'is-highlighted': item.key === activeHighlightKey }]">
              <component
                :is="item.kind === 'web' ? 'a' : 'div'"
                class="visual-reference-item__body"
                :class="{ 'is-expandable': item.kind === 'document' && hasMoreContent(item) }"
                :href="item.kind === 'web' ? item.url : undefined"
                :target="item.kind === 'web' ? '_blank' : undefined"
                :rel="item.kind === 'web' ? 'noopener noreferrer' : undefined"
                :role="item.kind === 'document' && hasMoreContent(item) ? 'button' : undefined"
                :tabindex="item.kind === 'document' && hasMoreContent(item) ? 0 : undefined"
                @mousedown="trackContentPointerDown"
                @click="item.kind === 'document' && hasMoreContent(item) ? toggleDocumentSnippet(item, $event) : undefined"
                @keydown.enter="item.kind === 'document' && hasMoreContent(item) ? toggleDocumentSnippet(item) : undefined"
                @keydown.space.prevent="item.kind === 'document' && hasMoreContent(item) ? toggleDocumentSnippet(item) : undefined"
              >
                <template v-if="item.kind === 'document'">
                  <div class="visual-reference-document">
                    <div class="visual-reference-item__title-row">
                      <span class="visual-reference-document__icon" aria-hidden="true"><t-icon name="file" /></span>
                      <h5>{{ item.title }}</h5>
                      <a v-if="item.knowledgeBaseId && !embeddedMode && !marketplaceActive" class="visual-reference-item__open" :href="getDocumentHref(item)" target="_blank" rel="noopener noreferrer" :aria-label="t('chat.navigateToDocument')" :title="t('chat.navigateToDocument')" @click.stop><t-icon name="jump" /></a>
                    </div>
                    <p v-if="item.snippet && !expandedKeys.has(item.key)" class="visual-reference-item__snippet">{{ formatReferenceSnippet(item.snippet) }}</p>
                    <div v-if="expandedKeys.has(item.key)" class="visual-reference-item__content">{{ formatReferenceSnippet(item.content) }}</div>
                  </div>
                </template>

                <template v-else>
                  <div v-if="item.domain || item.kind === 'tool'" class="visual-reference-item__source">
                    <img v-if="item.kind === 'web' && item.faviconUrl" :src="item.faviconUrl" alt="" loading="lazy" @error="onFaviconError" />
                    <span v-else class="visual-reference-item__source-icon" aria-hidden="true"><t-icon :name="item.kind === 'tool' ? 'search' : 'link'" /></span>
                    <span>{{ item.domain || sectionTitle(section.id) }}</span>
                  </div>
                  <div class="visual-reference-item__title-row">
                    <h5 v-if="shouldShowItemTitle(item)" class="visual-reference-item__title">{{ item.title }}</h5>
                    <t-icon v-if="item.kind === 'tool'" name="chevron-right" class="visual-reference-item__chevron" />
                  </div>
                  <p v-if="item.kind !== 'tool' && item.snippet && !expandedKeys.has(item.key)" class="visual-reference-item__snippet">{{ formatReferenceSnippet(item.snippet) }}</p>
                  <div v-if="item.kind === 'tool' && item.content" class="visual-reference-item__content is-tool">{{ formatReferenceSnippet(item.content) }}</div>
                </template>
              </component>
            </article>
          </section>
        </div>
      </aside>
    </Transition>
  </Teleport>
  <Transition name="visual-references-backdrop"><div v-if="visible && useOverlay" class="visual-references-backdrop" @click="close" /></Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useChatReferencesDrawer } from '@/composables/useChatReferencesDrawer'
import { buildReferenceSections, formatReferenceSnippet, resolveReferenceHighlightKey, type ReferenceListItem } from '@/utils/referenceSources'

const props = defineProps<{ embeddedMode?: boolean; overlayBreakpoint?: number }>()
const { t } = useI18n()
const router = useRouter()
const drawer = useChatReferencesDrawer()
const marketplaceActive = computed(() => Boolean(drawer?.marketplaceProductId.value))
const listElement = ref<HTMLElement | null>(null)
const itemElements = new Map<string, HTMLElement>()
const expandedKeys = reactive(new Set<string>())
const pointerDownSelectionText = ref('')
const panelEntered = ref(false)
const visible = computed(() => drawer?.visible.value ?? false)
const references = computed(() => drawer?.references.value ?? [])
const highlight = computed(() => drawer?.highlight.value ?? null)
const useOverlay = computed(() => {
  if (props.embeddedMode) return true
  if (typeof window === 'undefined') return false
  return window.innerWidth < (props.overlayBreakpoint ?? 960)
})
const sections = computed(() => buildReferenceSections(references.value))
const totalCount = computed(() => sections.value.reduce((sum, section) => sum + section.items.length, 0))
const activeHighlightKey = computed(() => resolveReferenceHighlightKey(references.value, highlight.value))
const panelTitle = computed(() => {
  const webCount = sections.value.find((section) => section.id === 'web')?.items.length ?? 0
  const docCount = sections.value.find((section) => section.id === 'documents')?.items.length ?? 0
  const toolCount = sections.value.find((section) => section.id === 'tools')?.items.length ?? 0
  if (toolCount > 0 && webCount === 0 && docCount === 0) return t('chat.referencesDrawerTitleTools')
  if ([webCount, docCount, toolCount].filter((count) => count > 0).length > 1) return t('chat.referencesDrawerTitleMixed')
  if (webCount > 0) return t('chat.referencesDrawerTitleWeb')
  if (docCount > 0) return t('chat.referencesDrawerTitleDocs')
  return t('chat.referencesDrawerTitle')
})
function sectionTitle(id: 'web' | 'documents' | 'tools') {
  if (id === 'web') return t('chat.referencesDrawerWebSection')
  if (id === 'tools') return t('chat.referencesDrawerToolsSection')
  return t('chat.referencesDrawerDocsSection')
}
function close() { drawer?.close() }
function setItemRef(key: string, el: HTMLElement | null) { if (!el) itemElements.delete(key); else itemElements.set(key, el) }
function onFaviconError(event: Event) { const img = event.target as HTMLImageElement | null; if (img) img.style.display = 'none' }
function hasMoreContent(item: ReferenceListItem) {
  const content = String(item.content || '').trim()
  const snippet = String(item.snippet || '').replace(/…$/, '').trim()
  if (!content) return false
  if (!snippet) return true
  return content.length > snippet.length && !content.startsWith(snippet) ? true : content.length > snippet.length + 8
}
function getSelectedText() { return typeof window === 'undefined' ? '' : window.getSelection()?.toString().trim() || '' }
function trackContentPointerDown() { pointerDownSelectionText.value = getSelectedText() }
function shouldIgnoreContentToggle(event?: MouseEvent) {
  if (!event) return false
  const selectedText = getSelectedText()
  if (selectedText || pointerDownSelectionText.value) { pointerDownSelectionText.value = ''; return true }
  pointerDownSelectionText.value = ''
  return false
}
function toggleDocumentSnippet(item: ReferenceListItem, event?: MouseEvent) {
  if (shouldIgnoreContentToggle(event)) return
  if (expandedKeys.has(item.key)) expandedKeys.delete(item.key)
  else expandedKeys.add(item.key)
}
function getDocumentHref(item: ReferenceListItem) {
  if (!item.knowledgeBaseId) return ''
  const query: Record<string, string> = {}
  if (item.knowledgeId) query.knowledge_id = item.knowledgeId
  return router.resolve({ path: `/platform/knowledge-bases/${item.knowledgeBaseId}`, query }).href
}
function shouldShowItemTitle(item: ReferenceListItem) {
  if (item.kind !== 'web') return true
  const title = item.title?.trim()
  const domain = item.domain?.trim()
  return Boolean(title && title !== domain)
}
async function scrollToHighlight() {
  if (!panelEntered.value) return
  const key = activeHighlightKey.value
  if (!key) return
  await nextTick()
  const el = itemElements.get(key)
  const container = listElement.value
  if (!el || !container) return
  const itemRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  let nextTop: number | null = null
  if (itemRect.top < containerRect.top) nextTop = container.scrollTop + itemRect.top - containerRect.top - 8
  else if (itemRect.bottom > containerRect.bottom) nextTop = container.scrollTop + itemRect.bottom - containerRect.bottom + 8
  if (nextTop !== null) container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}
function handlePanelAfterEnter() { panelEntered.value = true; void scrollToHighlight() }
watch(activeHighlightKey, () => { void scrollToHighlight() })
watch(highlight, () => { void scrollToHighlight() })
watch(visible, (open) => { if (!open) { panelEntered.value = false; expandedKeys.clear() } })
</script>

<style scoped lang="less">
.visual-references-backdrop { position: fixed; inset: 0; z-index: 1200; background: rgb(0 0 0 / 22%); }
.visual-references-panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 1201; width: min(420px,100vw); min-width: 0; display: flex; flex-direction: column; border-left: 1px solid rgb(229 231 235 / 80%); background: #fff; color: #374151; }
.visual-references-panel__header { flex: 0 0 auto; padding: 14px 16px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; background: #fdfdfd; }
.visual-references-panel__heading h3 { margin: 0; display: flex; align-items: center; gap: 6px; color: #111827; font-size: 14px; line-height: 20px; font-weight: 700; }
.visual-references-panel__dot { color: #9ca3af; font-weight: 400; }
.visual-references-panel__count { color: #6b7280; font-size: 12px; font-weight: 600; }
.visual-references-panel__close { width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-references-panel__close:hover { color: #374151; background: #f3f4f6; }
.visual-references-panel__close :deep(.t-icon) { font-size: 16px; }
.visual-references-panel__body { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 14px; text-align: left; }
.visual-references-panel__empty { height: 100%; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #9ca3af; text-align: center; }
.visual-references-panel__empty :deep(.t-icon) { font-size: 32px; color: #d1d5db; }
.visual-references-panel__empty p { margin: 0; font-size: 12px; }
.visual-reference-section + .visual-reference-section { margin-top: 16px; padding-top: 4px; }
.visual-reference-section > h4 { margin: 0 0 8px; padding: 0 4px; color: #9ca3af; font-size: 11px; line-height: 16px; font-weight: 700; }
.visual-reference-item { position: relative; border: 1px solid rgb(229 231 235 / 80%); border-radius: 12px; background: #fff; transition: all 150ms ease; }
.visual-reference-item + .visual-reference-item { margin-top: 10px; }
.visual-reference-item:hover { border-color: #d1d5db; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-reference-item.is-highlighted { border-color: #3b82f6; background: rgb(239 246 255 / 40%); box-shadow: 0 0 0 1px #3b82f6; }
.visual-reference-item__body { display: block; padding: 12px; color: inherit; text-decoration: none; }
.visual-reference-item__body.is-expandable { cursor: pointer; }
.visual-reference-document { min-width: 0; }
.visual-reference-item__title-row { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
.visual-reference-document__icon { flex: 0 0 14px; width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; color: #374151; }
.visual-reference-document__icon :deep(.t-icon) { font-size: 14px; }
.visual-reference-item__title-row h5,.visual-reference-item__title { min-width: 0; flex: 1 1 auto; margin: 0; overflow: hidden; color: #111827; font-size: 12px; line-height: 18px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.visual-reference-item__open { flex: 0 0 16px; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; color: #9ca3af; text-decoration: none; transition: color 150ms ease; }
.visual-reference-item:hover .visual-reference-item__open { color: #374151; }
.visual-reference-item__open :deep(.t-icon) { font-size: 12px; }
.visual-reference-item__source { min-width: 0; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; color: #9ca3af; font-size: 10.5px; line-height: 15px; font-weight: 600; }
.visual-reference-item__source img,.visual-reference-item__source-icon { flex: 0 0 12px; width: 12px; height: 12px; border-radius: 50%; object-fit: cover; display: inline-flex; align-items: center; justify-content: center; color: #9ca3af; }
.visual-reference-item__source-icon :deep(.t-icon) { font-size: 12px; }
.visual-reference-item__source > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-reference-item__chevron { flex: 0 0 12px; font-size: 12px; color: #9ca3af; }
.visual-reference-item__snippet,.visual-reference-item__content { margin: 0; color: #6b7280; font-size: 11px; line-height: 1.625; word-break: break-word; }
.visual-reference-item__snippet { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.visual-reference-item__content { max-height: 360px; overflow-y: auto; white-space: pre-wrap; user-select: text; }
.visual-reference-item__content.is-tool { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.visual-references-panel-enter-active,.visual-references-panel-leave-active { transition: transform 200ms ease,opacity 200ms ease; }
.visual-references-panel-enter-from,.visual-references-panel-leave-to { transform: translateX(100%); opacity: .6; }
.visual-references-backdrop-enter-active,.visual-references-backdrop-leave-active { transition: opacity 180ms ease; }
.visual-references-backdrop-enter-from,.visual-references-backdrop-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .visual-references-panel-enter-active,.visual-references-panel-leave-active,.visual-references-backdrop-enter-active,.visual-references-backdrop-leave-active { transition: none !important; } }
</style>
