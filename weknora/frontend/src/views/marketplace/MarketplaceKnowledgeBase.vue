<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { listMarketplaceLibrary, type MarketplaceLibraryEntry } from '@/api/creator-marketplace'
import WikiBrowser from '@/views/knowledge/wiki/WikiBrowser.vue'
import MarketplaceAccessStatus from './MarketplaceAccessStatus.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const entry = ref<MarketplaceLibraryEntry | null>(null)
const loading = ref(true)
const failure = ref<'denied' | 'temporary' | ''>('')
const view = ref<'browser' | 'graph'>('browser')
const openingChat = ref(false)
const scopeKey = computed(() => `${route.params.productId}:${route.params.kbId}:${auth.user?.id}:${auth.currentTenantId}:${auth.selectedTenantId}`)
let sequence = 0
function readFailed(error: unknown, key: string) {
  if (key !== scopeKey.value) return
  const status = (error as any)?.status
  failure.value = status === 403 ? 'denied' : 'temporary'
}
async function load() {
  const run = ++sequence
  const key = scopeKey.value
  entry.value = null
  failure.value = ''
  loading.value = true
  view.value = 'browser'
  try {
    const rows = await listMarketplaceLibrary()
    if (run !== sequence || key !== scopeKey.value) return
    entry.value = rows.find(row => row.product_id === route.params.productId && row.knowledge_base_id === route.params.kbId) || null
    if (!entry.value?.can_read) failure.value = 'denied'
  } catch (error) {
    if (run === sequence) readFailed(error, key)
  } finally {
    if (run === sequence) loading.value = false
  }
}
// A keyed mount isolates all Wiki caches and in-flight results when switching products.
const viewer = computed(() => {
  if (!entry.value || failure.value || loading.value) return null
  const key = scopeKey.value
  const run = sequence
  return { entry: entry.value, key: `${key}:${run}`, onError: (error: unknown) => {
    if (run === sequence) readFailed(error, key)
  } }
})
watch(scopeKey, load, { immediate: true, flush: 'sync' })
onUnmounted(() => { sequence++ })
async function ask() {
  if (!entry.value?.can_read || failure.value || openingChat.value) return
  openingChat.value = true
  try { await router.push({ path: '/platform/creatChat', query: { marketplace_product: entry.value.product_id } }) }
  finally { openingChat.value = false }
}
function showGraph(slug: string) {
  view.value = 'graph'
  void router.replace({ query: { ...route.query, slug } })
}
</script>

<template>
  <main class="visual-knowledge-page market-library-reader" :class="{ 'is-graph-tab': view === 'graph' }">
    <header class="visual-knowledge-header">
      <div class="visual-knowledge-header__copy">
        <nav class="visual-knowledge-breadcrumb" :aria-label="$t('menu.knowledgeBase')">
          <button type="button" class="visual-knowledge-breadcrumb__back" @click="router.push('/platform/knowledge-bases')">
            <t-icon name="chevron-left" /><span>{{ $t('menu.knowledgeBase') }}</span>
          </button>
          <span class="visual-knowledge-breadcrumb__sep">/</span>
          <button type="button" class="visual-knowledge-breadcrumb__current" disabled>
            <span>{{ entry?.name || $t('creatorMarketplace.libraryTitle') }}</span>
          </button>
          <template v-if="viewer?.entry.wiki_enabled">
            <span class="visual-knowledge-breadcrumb__sep">/</span>
            <span class="visual-knowledge-breadcrumb__section">{{ view === 'browser' ? 'Wiki' : $t('knowledgeEditor.wikiBrowser.tabGraph') }}</span>
          </template>
        </nav>
        <div v-if="entry" class="market-library-reader__metadata">
          <MarketplaceAccessStatus :can-use="entry.can_read" :status="entry.status" :paid-through="entry.paid_through" :cancel-at-period-end="entry.cancel_at_period_end" />
          <span v-if="entry.agent_name" class="market-library-reader__agent"><t-icon name="user" />{{ entry.agent_name }}</span>
        </div>
      </div>
      <div v-if="entry?.can_read && !failure && !loading" class="visual-knowledge-header__actions">
        <div v-if="viewer?.entry.wiki_enabled" class="visual-knowledge-tabs" role="tablist">
          <button type="button" :class="{ 'is-active': view === 'browser' }" role="tab" :aria-selected="view === 'browser'" @click="view = 'browser'">
            <t-icon name="book" /><span>Wiki</span>
          </button>
          <button type="button" :class="{ 'is-active': view === 'graph' }" role="tab" :aria-selected="view === 'graph'" @click="view = 'graph'">
            <t-icon name="chart-bubble" /><span>{{ $t('knowledgeEditor.wikiBrowser.tabGraph') }}</span>
          </button>
        </div>
        <t-button theme="default" variant="outline" size="small" :loading="openingChat" @click="ask">{{ $t('creatorMarketplace.startChat') }}</t-button>
      </div>
    </header>
    <div v-if="loading" role="status"><t-loading /></div>
    <div v-else-if="failure" class="market-library-reader__notice" role="alert">
      <p>{{ $t(failure === 'denied' ? 'creatorMarketplace.libraryDenied' : 'creatorMarketplace.libraryLoadFailed') }}</p>
      <t-link v-if="failure === 'denied'" theme="default" href="/platform/orders" @click.prevent="router.push('/platform/orders')">{{ $t('creatorMarketplace.orders') }}</t-link>
      <t-button v-else theme="default" variant="outline" @click="load">{{ $t('creatorMarketplace.retry') }}</t-button>
    </div>
    <section v-else-if="viewer?.entry.wiki_enabled" class="visual-knowledge-wiki-host">
      <WikiBrowser :key="viewer.key"
        :knowledge-base-id="viewer.entry.knowledge_base_id" :marketplace-product-id="viewer.entry.product_id"
        :can-edit="false" :view="view" @read-error="viewer.onError" @view-graph="showGraph" />
    </section>
    <p v-else role="status">{{ $t('creatorMarketplace.libraryEmpty') }}</p>
  </main>
</template>

<style scoped lang="less">
@import '../knowledge/components/knowledge-base-layout.less';
.market-library-reader__notice { padding: 24px 0; color: var(--td-text-color-secondary); }
.market-library-reader__metadata { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; }
.market-library-reader__agent { display: inline-flex; align-items: center; gap: 6px; color: var(--td-text-color-secondary); font-size: 12px; }
@media (max-width: 760px) {
  .market-library-reader .visual-knowledge-tabs { min-width: 0; flex: 1 1 0; }
  .market-library-reader .visual-knowledge-header__actions > :deep(.t-button) { flex-shrink: 0; }
}
</style>
