<template>
  <main class="market-page"><div class="market-container">
    <MarketplaceHeader :title="t('creatorMarketplace.title')" :description="t('creatorMarketplace.subtitle')" />
    <div class="market-toolbar"><t-input v-model="query" clearable :placeholder="t('creatorMarketplace.search')" :aria-label="t('creatorMarketplace.search')"><template #prefix-icon><t-icon name="search" /></template></t-input></div>
    <div v-if="loading" class="market-empty" role="status">{{ t('common.loading') }}</div>
    <div v-else-if="failed" class="market-error" role="alert"><span>{{ t('creatorMarketplace.loadFailed') }}</span><t-button theme="default" @click="load">{{ t('creatorMarketplace.retry') }}</t-button></div>
    <template v-else>
      <MarketplaceFeatured v-if="!query.trim() && featured.length" :products="featured" />
      <div class="market-filters">
        <div class="market-category-tabs" role="tablist" :aria-label="t('creatorMarketplace.category')">
          <button type="button" role="tab" :aria-label="t('creatorMarketplace.allRecommendations')" :aria-selected="category === ''" @click="category = ''">{{ t('creatorMarketplace.allRecommendations') }} <small>{{ catalog.length }}</small></button>
          <button v-for="item in categories" :key="item.name" type="button" role="tab" :aria-selected="category === item.name" :aria-label="item.name" @click="category = item.name">{{ item.name }} <small>{{ item.count }}</small></button>
        </div>
        <div class="market-filter-selects">
          <t-select class="visual-scene-select" role="combobox" :popup-props="filterPopupProps" v-model="priceFilter" :aria-label="t('creatorMarketplace.priceFilter')">
            <t-option value="all" :label="t('creatorMarketplace.allPrices')"><span class="market-filter-label">{{ t('creatorMarketplace.allPrices') }}</span></t-option><t-option value="free" :label="t('creatorMarketplace.free')"><span class="market-filter-label">{{ t('creatorMarketplace.free') }}</span></t-option><t-option value="paid" :label="t('creatorMarketplace.paid')"><span class="market-filter-label">{{ t('creatorMarketplace.paid') }}</span></t-option>
          </t-select>
          <t-select class="visual-scene-select" role="combobox" :popup-props="filterPopupProps" v-model="accessFilter" :aria-label="t('creatorMarketplace.statusLabel')">
            <t-option value="all" :label="t('creatorMarketplace.allAccess')"><span class="market-filter-label">{{ t('creatorMarketplace.allAccess') }}</span></t-option><t-option value="active" :label="t('creatorMarketplace.opened')"><span class="market-filter-label">{{ t('creatorMarketplace.opened') }}</span></t-option>
          </t-select>
          <t-select class="visual-scene-select" role="combobox" :popup-props="filterPopupProps" v-model="sort" :aria-label="t('creatorMarketplace.sortLabel')">
            <t-option value="recommended" :label="t('creatorMarketplace.recommendedSort')"><span class="market-filter-label">{{ t('creatorMarketplace.recommendedSort') }}</span></t-option><t-option value="newest" :label="t('creatorMarketplace.newestSort')"><span class="market-filter-label">{{ t('creatorMarketplace.newestSort') }}</span></t-option><t-option value="price" :label="t('creatorMarketplace.priceSort')"><span class="market-filter-label">{{ t('creatorMarketplace.priceSort') }}</span></t-option>
          </t-select>
        </div>
      </div>
      <section v-if="filtered.length" class="market-grid" :aria-label="t('creatorMarketplace.browse')">
        <RouterLink v-for="product in filtered" :key="product.id" class="market-card market-product-link" :to="`/platform/marketplace/${encodeURIComponent(product.id)}`" :aria-label="product.title">
          <img v-if="product.cover_url" class="market-cover" :src="product.cover_url" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <div class="market-card-body">
            <div class="market-actions"><span v-if="isFreeMarketProduct(product)" class="market-badge">{{ t('creatorMarketplace.free') }}</span><span v-else-if="product.access?.can_chat" class="market-badge market-badge--active">{{ t('creatorMarketplace.status.active') }}</span><span v-if="product.category" class="market-badge">{{ product.category }}</span></div>
            <h3>{{ product.title }}</h3>
            <p class="market-card-description">{{ product.description }}</p>
            <div class="market-card-footer"><strong class="market-price">{{ price(product) }}<small v-if="!isFreeMarketProduct(product)">{{ t('creatorMarketplace.perMonth') }}</small></strong></div>
          </div>
        </RouterLink>
      </section>
      <div v-else class="market-empty" role="status">
        <p>{{ t(hasFilters ? 'creatorMarketplace.noMatches' : 'creatorMarketplace.empty') }}</p>
        <t-button v-if="hasFilters" theme="default" @click="clearFilters">{{ t('creatorMarketplace.clearFilters') }}</t-button>
      </div>
    </template>
  </div></main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { listMarketplaceProducts, type MarketplaceProduct } from '@/api/creator-marketplace'
import MarketplaceHeader from './MarketplaceHeader.vue'
import MarketplaceFeatured from './MarketplaceFeatured.vue'
import { formatMarketPrice, isFreeMarketProduct, sortMarketProducts } from './marketplacePresentation'
import './marketplace.css'
const { t, locale } = useI18n()
const filterPopupProps = {
  overlayClassName: 'market-filter-popup',
  overlayInnerStyle: { width: '100%' },
  popperOptions: {
    modifiers: [{
      name: 'matchTriggerWidth',
      enabled: true,
      phase: 'beforeWrite',
      requires: ['computeStyles'],
      // Popper refreshes this on both reopening and resizing an open menu.
      fn: ({ state }: { state: { rects: { reference: { width: number } }; styles: { popper: { width?: string } } } }) => {
        state.styles.popper.width = `${state.rects.reference.width}px`
      },
    }],
  },
}
const products = ref<MarketplaceProduct[]>([])
const query = ref('')
const category = ref('')
const priceFilter = ref('all')
const accessFilter = ref('all')
const sort = ref('recommended')
const loading = ref(true)
const failed = ref(false)
const catalog = computed(() => sortMarketProducts(products.value.filter(p => !p.fixture)))
const featured = computed(() => catalog.value.filter(p => p.featured))
const categories = computed(() => Array.from(new Set(catalog.value.map(p => p.category).filter(Boolean))).map(name => ({ name, count: catalog.value.filter(p => p.category === name).length })))
const hasFilters = computed(() => Boolean(query.value.trim() || category.value || priceFilter.value !== 'all' || accessFilter.value !== 'all'))
const filtered = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  const result = catalog.value.filter(p =>
    (!q || `${p.title} ${p.description} ${p.category || ''}`.toLocaleLowerCase().includes(q)) &&
    (!category.value || p.category === category.value) &&
    (priceFilter.value === 'all' || (priceFilter.value === 'free' ? isFreeMarketProduct(p) : !isFreeMarketProduct(p))) &&
    (accessFilter.value === 'all' || p.access?.can_chat),
  )
  if (sort.value === 'price') result.sort((a, b) => a.monthly_amount - b.monthly_amount)
  if (sort.value === 'newest') result.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
  return result
})
function clearFilters() { query.value = ''; category.value = ''; priceFilter.value = 'all'; accessFilter.value = 'all'; sort.value = 'recommended' }
const price = (p: MarketplaceProduct) => isFreeMarketProduct(p) ? t('creatorMarketplace.free') : formatMarketPrice(p.monthly_amount, p.currency, locale.value)
async function load() {
  loading.value = true; failed.value = false
  try {
    let result = await listMarketplaceProducts()
    const collected = [...(result.data || [])]
    while (collected.length < result.total && result.data.length) {
      result = await listMarketplaceProducts({ offset: collected.length, limit: 100 })
      collected.push(...result.data)
    }
    products.value = collected
  } catch { failed.value = true }
  finally { loading.value = false }
}
onMounted(load)
</script>
