<template>
  <div v-if="product" class="market-home-entry">
    <div><span>{{ t('creatorMarketplace.featured') }}</span><span v-if="isFreeMarketProduct(product)">{{ t('creatorMarketplace.free') }}</span><RouterLink :to="`/platform/marketplace/${product.id}`">{{ product.title }} <t-icon name="arrow-right" /></RouterLink></div>
    <RouterLink class="market-home-all" to="/platform/marketplace">{{ t('creatorMarketplace.browse') }}</RouterLink>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listMarketplaceProducts, type MarketplaceProduct } from '@/api/creator-marketplace'
import { isFreeMarketProduct } from './marketplacePresentation'
const { t } = useI18n()
const product = ref<MarketplaceProduct>()
onMounted(async () => {
  try { const response = await listMarketplaceProducts({ limit: 12 }); product.value = response.data.find(p => p.featured && !p.fixture) }
  catch { /* Discovery is optional; the chat composer remains available. */ }
})
</script>
<style scoped>
.market-home-entry { display: flex; align-items: center; justify-content: space-between; gap: 18px; border: 1px solid var(--td-component-stroke); border-radius: 12px; padding: 13px 16px; width: 100%; }
.market-home-entry > div { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.market-home-entry span { font-size: 11px; color: var(--td-text-color-placeholder); }
.market-home-entry a { display: inline-flex; align-items: center; gap: 7px; color: var(--td-text-color-primary); font-size: 12px; text-decoration: none; }
.market-home-entry a:hover { text-decoration: underline; }
.market-home-entry .market-home-all { flex-shrink: 0; color: var(--td-text-color-secondary); }
</style>
