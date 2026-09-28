<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { MarketplaceLibraryEntry } from '@/api/creator-marketplace'
import MarketplaceAccessStatus from './MarketplaceAccessStatus.vue'

const props = withDefaults(defineProps<{
  entries: MarketplaceLibraryEntry[]
  loading?: boolean
  failed?: boolean
  searchQuery?: string
}>(), { loading: false, failed: false, searchQuery: '' })
const emit = defineEmits<{ retry: [] }>()
const router = useRouter()
const agentName = (entry: MarketplaceLibraryEntry) => entry.agent_name || entry.product_title
const agents = computed(() => {
  const services = new Map<string, MarketplaceLibraryEntry>()
  for (const entry of props.entries) {
    if (!services.has(entry.product_id)) services.set(entry.product_id, entry)
  }
  const query = props.searchQuery.trim().toLowerCase()
  return [...services.values()].filter(entry => !query || [agentName(entry), entry.product_title, entry.description]
    .some(value => value.toLowerCase().includes(query)))
})
const open = (entry: MarketplaceLibraryEntry) => entry.can_chat
  ? router.push({ path: '/platform/creatChat', query: { marketplace_product: entry.product_id } })
  : router.push({ name: 'marketplaceProduct', params: { productId: entry.product_id } })
</script>

<template>
  <section class="market-agent-cards" :aria-label="$t('creatorMarketplace.agentLibraryTitle')">
    <h2>{{ $t('creatorMarketplace.agentLibraryTitle') }} <small>{{ agents.length }}</small></h2>
    <div v-if="failed" role="alert">
      <p>{{ $t('creatorMarketplace.agentLibraryLoadFailed') }}</p>
      <t-button variant="outline" @click="emit('retry')">{{ $t('creatorMarketplace.retry') }}</t-button>
    </div>
    <t-loading v-else-if="loading" size="small" />
    <p v-else-if="!agents.length" role="status">{{ $t(searchQuery.trim() ? 'chat.noSearchResults' : 'creatorMarketplace.agentLibraryEmptySubscribed') }}</p>
    <div v-else class="agent-card-wrap">
      <div v-for="entry in agents" :key="entry.product_id" class="agent-card" role="button" tabindex="0"
        :aria-label="agentName(entry)" @click="open(entry)"
        @keydown.enter.prevent="open(entry)" @keydown.space.prevent="open(entry)">
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-title" :title="agentName(entry)">{{ agentName(entry) }}</span>
          </div>
        </div>
        <div class="card-content"><div class="card-description">{{ agentName(entry) !== entry.product_title ? entry.product_title : entry.description }}</div></div>
        <div class="card-bottom">
          <MarketplaceAccessStatus :can-use="entry.can_chat" :status="entry.status"
            :paid-through="entry.paid_through" :cancel-at-period-end="entry.cancel_at_period_end" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.market-agent-cards { min-width: 0; margin: 24px 0; }
.market-agent-cards h2 { margin: 0 0 12px; font-size: 15px; }
.agent-card { display: flex; flex-direction: column; cursor: pointer; }
.card-content { flex: 1; min-height: 0; overflow: hidden; }
</style>
