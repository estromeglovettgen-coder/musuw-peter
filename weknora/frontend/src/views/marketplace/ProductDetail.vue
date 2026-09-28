<template>
  <main class="market-page"><div class="market-container">
    <MarketplaceHeader back />
    <div v-if="loading" class="market-empty">{{ t('common.loading') }}</div>
    <div v-else-if="failed || !product" class="market-error" role="alert"><span>{{ t('creatorMarketplace.loadFailed') }}</span><t-button theme="default" @click="load">{{ t('creatorMarketplace.retry') }}</t-button></div>
    <div v-else class="market-detail">
      <section class="market-detail-main">
        <div class="market-detail-cover" aria-hidden="true">
          <img v-if="product.cover_url && !coverFailed" :src="product.cover_url" alt="" referrerpolicy="no-referrer" @error="coverFailed = true" />
          <div v-else class="market-detail-book">
            <strong>{{ product.title }}</strong>
            <span>{{ t('creatorMarketplace.knowledgeBook') }}</span>
            <small v-if="product.category">{{ product.category }}</small>
          </div>
        </div>
        <div class="market-detail-copy">
          <div class="market-actions"><span v-if="product.featured" class="market-badge">{{ t('creatorMarketplace.featured') }}</span><span v-if="product.fixture" class="market-badge market-badge--test">{{ t('creatorMarketplace.testBadge') }}</span><span v-if="product.category" class="market-badge">{{ product.category }}</span></div>
          <h1>{{ product.title }}</h1>
          <div v-if="description.lead" class="market-detail-lead" :class="{ 'market-detail-lead--preview': description.fullIntro }" v-html="description.lead"></div>
          <p class="market-muted market-detail-updated">{{ t('creatorMarketplace.updated', { date: formatMarketDate(product.updated_at, locale) }) }}</p>
        </div>
      </section>
      <aside class="market-purchase">
        <template v-if="isFreeMarketProduct(product)">
          <h2>{{ t('creatorMarketplace.free') }}</h2>
          <p class="market-note">{{ t('creatorMarketplace.freeAccessNote') }}</p>
          <t-button v-if="product.access?.can_chat" :loading="openingChat" @click="startChat">{{ t('creatorMarketplace.startChat') }}</t-button>
          <p v-else class="market-note">{{ t('creatorMarketplace.freeUnavailable') }}</p>
        </template>
        <template v-else-if="product.access?.can_chat">
          <h2>{{ t('creatorMarketplace.status.active') }}</h2>
          <p class="market-note">{{ accessDate }}</p>
          <t-button :loading="openingChat" @click="startChat">{{ t('creatorMarketplace.startChat') }}</t-button>
        </template>
        <template v-else-if="!product.checkout_available && product.access?.subscription_id && product.access.portal_available">
          <h2>{{ t(marketStatusKey(product.access.status)) }}</h2>
          <p class="market-note">{{ t('creatorMarketplace.existingSubscription') }}</p>
        </template>
        <template v-else>
          <div class="market-period" role="group" :aria-label="t('creatorMarketplace.period')"><button type="button" :aria-pressed="period === 'monthly'" @click="period = 'monthly'">{{ t('creatorMarketplace.monthly') }}</button><button type="button" :aria-pressed="period === 'yearly'" @click="period = 'yearly'">{{ t('creatorMarketplace.yearly') }}</button></div>
          <div class="market-price">{{ displayPrice }}<small>{{ t(period === 'yearly' ? 'creatorMarketplace.perYear' : 'creatorMarketplace.perMonth') }}</small></div>
          <p v-if="period === 'yearly'" class="market-note">{{ t('creatorMarketplace.annualSaving') }}</p>
          <t-button :disabled="!product.checkout_available || product.status !== 'published'" @click="showCheckout = true">{{ t('creatorMarketplace.subscribe') }}</t-button>
          <p v-if="product.status !== 'published'" class="market-note">{{ t('creatorMarketplace.unpublished') }}</p>
          <p v-else-if="!product.checkout_available" class="market-note">{{ t('creatorMarketplace.checkoutUnavailable') }}</p>
          <p class="market-note">{{ t('creatorMarketplace.renewalNote') }}</p>
          <p class="market-note">{{ t('creatorMarketplace.checkoutPriceNote') }}</p>
        </template>
        <details class="market-usage-details">
          <summary>{{ t('creatorMarketplace.usageDetails') }}</summary>
          <p class="market-note">{{ t('creatorMarketplace.scopeNote') }}</p>
          <p class="market-note">{{ t(isFreeMarketProduct(product) ? 'creatorMarketplace.freeAllowanceNote' : 'creatorMarketplace.allowanceNote') }}</p>
        </details>
      </aside>
      <section class="market-detail-content">
        <t-tabs v-model="detailTab" class="market-detail-tabs">
          <t-tab-panel v-for="tab in detailTabs" :key="tab.value" :value="tab.value" destroy-on-hide>
            <template #label>
              <button type="button" class="market-detail-tab-label" :aria-pressed="detailTab === tab.value" :aria-controls="`market-detail-${tab.value}`">{{ t(tab.label) }}</button>
            </template>
            <div :id="`market-detail-${tab.value}`" class="market-detail-tab-content" role="region" :aria-label="t(tab.label)">
              <template v-if="tab.value === 'overview'">
                <div v-if="description.fullIntro || (!description.sections.length && description.lead)" class="market-detail-about">
                  <h2>{{ t('creatorMarketplace.included') }}</h2>
                  <div class="market-description market-detail-markdown" v-html="description.fullIntro || description.lead"></div>
                </div>
                <div v-if="description.sections.length" class="market-detail-topics">
                  <h2>{{ t('creatorMarketplace.contentScope') }}</h2>
                  <div class="market-topic-grid">
                    <article v-for="(section, index) in description.sections" :key="index" class="market-topic">
                      <span class="market-topic-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                      <h3>{{ section.title }}</h3>
                      <div class="market-description market-detail-markdown" v-html="section.html"></div>
                    </article>
                  </div>
                </div>
                <p v-if="!description.lead && !description.sections.length" class="market-detail-empty">{{ t('creatorMarketplace.overviewEmpty') }}</p>
              </template>
              <template v-else>
                <div v-if="previewLoading" class="market-preview-loading" role="status"><t-loading size="small" />{{ t('common.loading') }}</div>
                <div v-else-if="previewFailed" class="market-error" role="alert"><span>{{ t('creatorMarketplace.previewLoadFailed') }}</span><t-button theme="default" @click="loadPreview">{{ t('creatorMarketplace.retry') }}</t-button></div>
                <template v-else-if="tab.value === 'contents'">
                  <MarketplaceContentDirectory v-if="preview?.directory?.length" class="market-detail-directory" :entries="preview.directory" />
                  <p v-else class="market-detail-empty">{{ t('creatorMarketplace.directoryEmpty') }}</p>
                </template>
                <template v-else>
                  <MarketplaceExampleConversation v-if="preview?.examples?.length" class="market-detail-qa" :examples="preview.examples" />
                  <p v-else class="market-detail-empty">{{ t('creatorMarketplace.examplesEmpty') }}</p>
                </template>
              </template>
            </div>
          </t-tab-panel>
        </t-tabs>
      </section>
    </div>
    <MarketplaceCheckout v-if="showCheckout && product" :product="product" :period="period" @close="closeCheckout" @activated="afterActivated" />
  </div></main>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Marked, type Token } from 'marked'
import DOMPurify from 'dompurify'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getMarketplaceProduct, getMarketplaceProductPreview, type MarketplaceProductPreview, type MarketplaceProduct, type MarketplaceBillingPeriod } from '@/api/creator-marketplace'
import MarketplaceHeader from './MarketplaceHeader.vue'
import MarketplaceCheckout from './MarketplaceCheckout.vue'
import MarketplaceContentDirectory from './MarketplaceContentDirectory.vue'
import MarketplaceExampleConversation from './MarketplaceExampleConversation.vue'
import { formatMarketPrice, formatMarketDate, isFreeMarketProduct, marketStatusKey } from './marketplacePresentation'
import './marketplace.css'
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const product = ref<MarketplaceProduct | null>(null)
const loading = ref(true)
const failed = ref(false)
const period = ref<MarketplaceBillingPeriod>('monthly')
const showCheckout = ref(false)
const openingChat = ref(false)
const coverFailed = ref(false)
const detailTab = ref('overview')
const preview = ref<MarketplaceProductPreview | null>(null)
const previewLoading = ref(false)
const previewFailed = ref(false)
let previewRequestId = 0
const detailTabs = [
  { value: 'overview', label: 'creatorMarketplace.overviewTab' },
  { value: 'contents', label: 'creatorMarketplace.contentsTab' },
  { value: 'examples', label: 'creatorMarketplace.examplesTab' },
]
// Existing description content can use standard Markdown headings; no parallel product fields.
const markdown = new Marked({ breaks: true })
function renderDescription(tokens: Token[]) {
  return DOMPurify.sanitize(markdown.parser(tokens), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h3', 'h4', 'a'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  })
}
const description = computed(() => {
  const intro: Token[] = []
  const sections: { title: string; tokens: Token[] }[] = []
  for (const token of markdown.lexer(product.value?.description || '')) {
    if (token.type === 'heading' && token.depth === 2) sections.push({ title: token.text, tokens: [] })
    else (sections.length ? sections[sections.length - 1].tokens : intro).push(token)
  }
  const leadTokens = intro.filter(token => token.type !== 'space')
  const first = leadTokens[0]
  const needsFullIntro = leadTokens.length > 1 || (first && (
    first.type !== 'paragraph' || first.raw.length > 180 || first.raw.trim().split('\n').length > 3
  ))
  return {
    lead: renderDescription(leadTokens.slice(0, 1)),
    // Keep lengthy descriptions available below the action, rather than truncating their content.
    fullIntro: needsFullIntro ? renderDescription(intro) : '',
    sections: sections.map(section => ({ title: section.title, html: renderDescription(section.tokens) })),
  }
})
let requestId = 0
const displayPrice = computed(() => product.value ? formatMarketPrice(period.value === 'yearly' ? product.value.yearly_amount : product.value.monthly_amount, product.value.currency, locale.value) : '')
const accessDate = computed(() => t(product.value?.access?.cancel_at_period_end ? 'creatorMarketplace.cancelScheduled' : 'creatorMarketplace.availableUntil', { date: formatMarketDate(product.value?.access?.paid_through, locale.value) }))
async function load() {
  const current = ++requestId
  loading.value = true; failed.value = false
  try { const value = await getMarketplaceProduct(String(route.params.productId)); if (current === requestId) product.value = value }
  catch { if (current === requestId) failed.value = true }
  finally { if (current === requestId) loading.value = false }
}
async function loadPreview() {
  if (!product.value || preview.value || previewLoading.value) return
  const current = ++previewRequestId
  const id = product.value.id
  previewLoading.value = true; previewFailed.value = false
  try {
    const data = await getMarketplaceProductPreview(id)
    if (current === previewRequestId) preview.value = data
  } catch {
    if (current === previewRequestId) previewFailed.value = true
  } finally {
    if (current === previewRequestId) previewLoading.value = false
  }
}
watch(detailTab, value => { if (value !== 'overview') void loadPreview() })
onUnmounted(() => { requestId++; previewRequestId++ })
async function startChat() {
  if (!product.value || openingChat.value) return
  openingChat.value = true
  try { await router.push({ path: '/platform/creatChat', query: { marketplace_product: product.value.id } }) }
  finally { openingChat.value = false }
}
function closeCheckout() { showCheckout.value = false; void load() }
async function afterActivated() { showCheckout.value = false; await load(); if (product.value?.access?.can_chat) await startChat() }
watch(() => route.params.productId, () => { product.value = null; previewRequestId++; preview.value = null; previewLoading.value = false; previewFailed.value = false; detailTab.value = 'overview'; coverFailed.value = false; showCheckout.value = false; void load() }, { immediate: true })
</script>
