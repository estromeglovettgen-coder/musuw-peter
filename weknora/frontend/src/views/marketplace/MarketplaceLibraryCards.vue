<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { MarketplaceLibraryEntry } from '@/api/creator-marketplace'
import KnowledgeBaseListReferenceCard from '@/views/knowledge/components/KnowledgeBaseListReferenceCard.vue'
import MarketplaceAccessStatus from './MarketplaceAccessStatus.vue'

defineProps<{ entries: MarketplaceLibraryEntry[]; loading: boolean; failed: boolean; showEmpty?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const router = useRouter()
const card = (entry: MarketplaceLibraryEntry) => ({ name: entry.name, description: entry.description, type: 'document', indexing_strategy: { wiki_enabled: entry.wiki_enabled } })
const open = (entry: MarketplaceLibraryEntry) => router.push({ name: 'marketplaceKnowledgeBase', params: { productId: entry.product_id, kbId: entry.knowledge_base_id } })
</script>

<template>
  <section v-if="entries.length || loading || failed || showEmpty" class="visual-kb-source-group market-library-cards" :aria-label="$t('creatorMarketplace.libraryTitle')">
    <h2>{{ $t('creatorMarketplace.libraryTitle') }} <small v-if="!loading">{{ entries.length }}</small></h2>
    <div v-if="loading" role="status"><t-loading /></div>
    <div v-else-if="failed" role="alert">
      <p>{{ $t('creatorMarketplace.libraryLoadFailed') }}</p>
      <t-button theme="default" variant="outline" @click="emit('retry')">{{ $t('creatorMarketplace.retry') }}</t-button>
    </div>
    <div v-else-if="entries.length" class="visual-kb-grid">
      <KnowledgeBaseListReferenceCard
        v-for="entry in entries" :key="`${entry.product_id}:${entry.knowledge_base_id}`"
        :kb="card(entry)" shared :can-favorite="false" :can-duplicate="false" :can-manage="false"
        :show-strategies="entry.wiki_enabled"
        role="button" tabindex="0" :aria-label="entry.name" @open="open(entry)"
        @keydown.enter.prevent="open(entry)" @keydown.space.prevent="open(entry)"
      >
        <template #footer>
          <MarketplaceAccessStatus :can-use="entry.can_read" :status="entry.status" :paid-through="entry.paid_through" :cancel-at-period-end="entry.cancel_at_period_end" />
        </template>
      </KnowledgeBaseListReferenceCard>
    </div>
    <p v-else class="visual-kb-source-empty" role="status">{{ $t('creatorMarketplace.libraryEmptySubscribed') }}</p>
  </section>
</template>
