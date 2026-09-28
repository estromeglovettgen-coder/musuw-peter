<template>
  <main class="market-page"><div class="market-container">
    <MarketplaceHeader :title="t('creatorMarketplace.admin')" :description="t('creatorMarketplace.adminIntro')" />
    <div class="market-toolbar"><t-select v-model="status" :options="statusOptions" style="max-width: 220px" :aria-label="t('creatorMarketplace.statusLabel')" /><t-button theme="default" :loading="loading" @click="load">{{ t('creatorMarketplace.refresh') }}</t-button></div>
    <div v-if="loading" class="market-empty">{{ t('common.loading') }}</div>
    <div v-else-if="failed" class="market-error" role="alert">{{ t('creatorMarketplace.loadFailed') }}<t-button theme="default" @click="load">{{ t('creatorMarketplace.retry') }}</t-button></div>
    <p v-else-if="!products.length" class="market-empty">{{ t('creatorMarketplace.noAdminProducts') }}</p>
    <div v-else class="market-table-wrap"><table class="market-table"><thead><tr><th>{{ t('creatorMarketplace.product') }}</th><th>{{ t('creatorMarketplace.statusLabel') }}</th><th>{{ t('creatorMarketplace.amount') }}</th><th>{{ t('creatorMarketplace.review') }}</th></tr></thead><tbody><tr v-for="product in products" :key="product.id"><td>{{ product.title }}<small>{{ product.id }}</small><span v-if="product.fixture" class="market-badge market-badge--test">{{ t('creatorMarketplace.testBadge') }}</span></td><td><span class="market-badge">{{ t(marketStatusKey(product.status)) }}</span></td><td><span v-if="isFreeMarketProduct(product)">{{ t('creatorMarketplace.free') }}</span><template v-else>{{ formatMarketPrice(product.monthly_amount, product.currency, locale) }} {{ t('creatorMarketplace.perMonth') }}<small>{{ formatMarketPrice(product.yearly_amount, product.currency, locale) }} {{ t('creatorMarketplace.perYear') }}</small></template></td><td><div class="market-actions"><t-button size="small" theme="default" @click="editing = product">{{ t('creatorMarketplace.editProduct') }}</t-button><t-button size="small" @click="openReview(product)">{{ t('creatorMarketplace.review') }}</t-button></div></td></tr></tbody></table></div>
    <ProductEditor v-if="editing" :product="editing" admin @close="editing = undefined" @saved="afterEdit" />
    <t-dialog v-if="reviewing" :visible="true" :header="`${t('creatorMarketplace.review')} · ${reviewing.title}`" width="720px" :footer="false" :close-on-overlay-click="false" class="market-dialog" @close="reviewing = undefined">
      <div class="market-form">
        <div class="market-panel"><p class="market-description">{{ reviewing.description }}</p><p class="market-note">{{ t('creatorMarketplace.agent') }}: {{ reviewing.agent_name || reviewing.agent_id }}<br />{{ t('creatorMarketplace.knowledgeBases') }}: {{ reviewing.knowledge_base_names?.join('、') || reviewing.knowledge_base_ids.join(', ') }}</p><p class="market-note">{{ t('creatorMarketplace.contact') }}: {{ reviewing.contact }}</p><p class="market-review-note">{{ reviewing.authorization }}</p><span class="market-badge">{{ t(reviewing.authorization_confirmed ? 'creatorMarketplace.rightsConfirmed' : 'creatorMarketplace.rightsMissing') }}</span></div>
        <p class="market-note">{{ t('creatorMarketplace.platformMappingNote') }}</p>
        <label>{{ t('creatorMarketplace.platformAgent') }}<t-select v-model="reviewForm.platform_agent_id" filterable :options="platformAgentOptions" /></label>
        <label>{{ t('creatorMarketplace.platformKnowledgeBases') }}<t-select v-model="reviewForm.platform_knowledge_base_ids" multiple filterable :options="platformKbOptions" /></label>
        <template v-if="!isFreeMarketProduct(reviewing)">
          <label>{{ t('creatorMarketplace.paddleProduct') }}<t-input v-model="reviewForm.paddle_product_id" placeholder="pro_…" /></label>
          <div class="market-form-grid"><label>{{ t('creatorMarketplace.monthlyPriceId') }}<t-input v-model="reviewForm.monthly_price_id" placeholder="pri_…" /></label><label>{{ t('creatorMarketplace.yearlyPriceId') }}<t-input v-model="reviewForm.yearly_price_id" placeholder="pri_…" /></label></div>
          <p class="market-note">{{ t('creatorMarketplace.mappingNote') }}</p>
        </template>
        <p v-else class="market-note">{{ t('creatorMarketplace.freeMappingNote') }}</p>
        <div class="market-actions"><t-checkbox v-model="reviewForm.featured">{{ t('creatorMarketplace.featuredLabel') }}</t-checkbox><t-checkbox v-model="reviewForm.fixture">{{ t('creatorMarketplace.testingLabel') }}</t-checkbox></div>
        <label>{{ t('creatorMarketplace.reviewReason') }}<t-textarea v-model="reviewForm.review_note" :autosize="{ minRows: 3, maxRows: 6 }" /></label>
        <p v-if="reviewError" class="market-error" role="alert">{{ reviewError }}</p>
        <div class="market-actions"><t-button :loading="reviewAction === 'approve'" :disabled="Boolean(reviewAction)" @click="review('approve')">{{ t(reviewing.status === 'published' ? 'creatorMarketplace.savePublication' : 'creatorMarketplace.approve') }}</t-button><t-button v-if="reviewing.status === 'pending'" theme="default" :loading="reviewAction === 'reject'" :disabled="Boolean(reviewAction)" @click="review('reject')">{{ t('creatorMarketplace.reject') }}</t-button><t-button v-if="reviewing.status === 'published'" theme="danger" variant="outline" :loading="reviewAction === 'unpublish'" :disabled="Boolean(reviewAction)" @click="review('unpublish')">{{ t('creatorMarketplace.unpublish') }}</t-button><t-button theme="default" :disabled="Boolean(reviewAction)" @click="reviewing = undefined">{{ t('creatorMarketplace.cancel') }}</t-button></div>
      </div>
    </t-dialog>
  </div></main>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { listAdminMarketplaceProducts, reviewMarketplaceProduct, type MarketplaceProduct, type MarketplaceReviewInput } from '@/api/creator-marketplace'
import { listAgents, type CustomAgent } from '@/api/agent'
import { listKnowledgeBases } from '@/api/knowledge-base'
import MarketplaceHeader from './MarketplaceHeader.vue'
import ProductEditor from './ProductEditor.vue'
import { formatMarketPrice, isFreeMarketProduct, marketStatusKey } from './marketplacePresentation'
import './marketplace.css'
const { t, locale } = useI18n()
const status = ref('pending')
const statusOptions = computed(() => [{ value: '', label: t('creatorMarketplace.allStatuses') }, ...['pending', 'published', 'rejected', 'draft', 'unpublished'].map(value => ({ value, label: t(marketStatusKey(value)) }))])
const products = ref<MarketplaceProduct[]>([])
const loading = ref(true)
const failed = ref(false)
const editing = ref<MarketplaceProduct>()
const reviewing = ref<MarketplaceProduct>()
const reviewForm = reactive({ platform_agent_id: '', platform_knowledge_base_ids: [] as string[], paddle_product_id: '', monthly_price_id: '', yearly_price_id: '', review_note: '', featured: false, fixture: false })
const reviewAction = ref('')
const reviewError = ref('')
const agents = ref<CustomAgent[]>([])
const knowledgeBases = ref<Array<{ id: string; name: string }>>([])
const platformAgentOptions = computed(() => {
  const result = agents.value.filter(a => !a.is_builtin).map(a => ({ value: a.id, label: a.name }))
  if (reviewForm.platform_agent_id && !result.some(a => a.value === reviewForm.platform_agent_id)) result.push({ value: reviewForm.platform_agent_id, label: reviewForm.platform_agent_id })
  return result
})
const platformKbOptions = computed(() => {
  const result = knowledgeBases.value.map(k => ({ value: k.id, label: k.name }))
  reviewForm.platform_knowledge_base_ids.forEach(id => { if (!result.some(k => k.value === id)) result.push({ value: id, label: id }) })
  return result
})
let sequence = 0
async function load() {
  const run = ++sequence
  loading.value = true; failed.value = false
  try { const result = await listAdminMarketplaceProducts({ status: status.value || undefined }); if (run === sequence) products.value = result.data || [] }
  catch { if (run === sequence) failed.value = true }
  finally { if (run === sequence) loading.value = false }
}
async function openReview(product: MarketplaceProduct) {
  reviewing.value = product; reviewError.value = ''
  Object.assign(reviewForm, { platform_agent_id: product.platform_agent_id || '', platform_knowledge_base_ids: [...(product.platform_knowledge_base_ids || [])], paddle_product_id: product.paddle_product_id || '', monthly_price_id: product.monthly_price_id || '', yearly_price_id: product.yearly_price_id || '', review_note: product.review_note || '', featured: product.featured, fixture: product.fixture })
  try { const [a, k] = await Promise.all([listAgents(), listKnowledgeBases()]); agents.value = a.data || []; knowledgeBases.value = (k as any).data || [] }
  catch { reviewError.value = t('creatorMarketplace.loadFailed') }
}
async function review(action: MarketplaceReviewInput['action']) {
  if (!reviewing.value || reviewAction.value) return
  reviewError.value = ''
  if (action === 'reject' && !reviewForm.review_note.trim()) { reviewError.value = t('creatorMarketplace.reviewRequired'); return }
  const free = isFreeMarketProduct(reviewing.value)
  if (action === 'approve' && (!reviewForm.platform_agent_id || !reviewForm.platform_knowledge_base_ids.length)) { reviewError.value = t('creatorMarketplace.platformMappingRequired'); return }
  if (action === 'approve' && !free && (!reviewForm.paddle_product_id || !reviewForm.monthly_price_id || !reviewForm.yearly_price_id)) { reviewError.value = t('creatorMarketplace.mappingRequired'); return }
  reviewAction.value = action
  const mapping = free ? { ...reviewForm, paddle_product_id: '', monthly_price_id: '', yearly_price_id: '' } : reviewForm
  try { await reviewMarketplaceProduct(reviewing.value.id, { ...mapping, action }); MessagePlugin.success(t('creatorMarketplace.reviewed')); reviewing.value = undefined; await load() }
  catch (error: any) { reviewError.value = error?.message || t('creatorMarketplace.saveFailed') }
  finally { reviewAction.value = '' }
}
function afterEdit() { editing.value = undefined; void load() }
watch(status, load)
onMounted(load)
</script>
