<template>
  <main class="market-page"><div class="market-container">
    <MarketplaceHeader :title="t('creatorMarketplace.creator')" :description="t('creatorMarketplace.creatorIntro')" />
    <div v-if="!canCreate && !entitlementStore.loading" class="market-panel"><p class="market-muted">{{ t('creatorMarketplace.maxRequired') }}</p><t-button theme="default" @click="router.push({ path: '/plans', query: { plan: 'max' } })">{{ t('creatorMarketplace.upgradeMax') }}</t-button></div>
    <div class="market-section-heading"><h2>{{ t('creatorMarketplace.product') }}</h2><t-button :disabled="!canCreate" @click="openEditor()"><template #icon><t-icon name="add" /></template>{{ t('creatorMarketplace.newProduct') }}</t-button></div>
    <div v-if="loading" class="market-empty">{{ t('common.loading') }}</div>
    <div v-else-if="failed" class="market-error" role="alert">{{ t('creatorMarketplace.loadFailed') }}<t-button theme="default" @click="load">{{ t('creatorMarketplace.retry') }}</t-button></div>
    <p v-else-if="!products.length" class="market-empty">{{ t('creatorMarketplace.noCreatorProducts') }}</p>
    <article v-for="product in products" v-else :key="product.id" class="market-panel">
      <div class="market-section-heading"><div><h2>{{ product.title }}</h2><span class="market-badge">{{ t(marketStatusKey(product.status)) }}</span></div><div class="market-actions"><t-button v-if="['draft', 'rejected'].includes(product.status)" theme="default" :disabled="!canCreate" @click="openEditor(product)">{{ t('creatorMarketplace.editProduct') }}</t-button><t-button v-if="['draft', 'rejected'].includes(product.status)" :disabled="!canCreate" :loading="submitting === product.id" @click="submit(product)">{{ t('creatorMarketplace.submitReview') }}</t-button><RouterLink v-if="product.status === 'published'" class="market-link" :to="`/platform/marketplace/${product.id}`">{{ t('creatorMarketplace.viewDetails') }}</RouterLink></div></div>
      <p class="market-muted">{{ product.description }}</p><p v-if="isFreeMarketProduct(product)" class="market-note">{{ t('creatorMarketplace.free') }}</p><p v-else class="market-note">{{ formatMarketPrice(product.monthly_amount, product.currency, locale) }} {{ t('creatorMarketplace.perMonth') }} · {{ formatMarketPrice(product.yearly_amount, product.currency, locale) }} {{ t('creatorMarketplace.perYear') }}</p>
      <p v-if="product.review_note" class="market-review-note"><strong>{{ t('creatorMarketplace.reviewNote') }}</strong><br />{{ product.review_note }}</p>
    </article>
    <ProductEditor v-if="editorOpen" :product="editing" @close="editorOpen = false" @saved="saved" />
  </div></main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { listCreatorProducts, submitCreatorProduct, type MarketplaceProduct } from '@/api/creator-marketplace'
import { useCurrentEntitlementStore } from '@/stores/entitlement'
import MarketplaceHeader from './MarketplaceHeader.vue'
import ProductEditor from './ProductEditor.vue'
import { formatMarketPrice, isFreeMarketProduct, marketStatusKey } from './marketplacePresentation'
import './marketplace.css'
const { t, locale } = useI18n()
const router = useRouter()
const entitlementStore = useCurrentEntitlementStore()
const canCreate = computed(() => entitlementStore.entitlement?.plan === 'max')
const products = ref<MarketplaceProduct[]>([])
const loading = ref(true)
const failed = ref(false)
const submitting = ref('')
const editorOpen = ref(false)
const editing = ref<MarketplaceProduct>()
async function load() {
  loading.value = true; failed.value = false
  try { const result = await listCreatorProducts(); products.value = result.data || [] }
  catch { failed.value = true }
  finally { loading.value = false }
}
function openEditor(product?: MarketplaceProduct) { editing.value = product; editorOpen.value = true }
function saved() { editorOpen.value = false; void load() }
async function submit(product: MarketplaceProduct) {
  if (submitting.value) return
  submitting.value = product.id
  try { await submitCreatorProduct(product.id); MessagePlugin.success(t('creatorMarketplace.submitted')); await load() }
  catch { MessagePlugin.error(t('creatorMarketplace.saveFailed')) }
  finally { submitting.value = '' }
}
onMounted(() => { void entitlementStore.ensureFresh(); void load() })
</script>
<style scoped>.market-panel > .t-button { margin-top: 14px; }</style>
