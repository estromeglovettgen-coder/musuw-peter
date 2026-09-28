<template>
  <main class="market-page"><div class="market-container">
    <MarketplaceHeader :title="t('creatorMarketplace.orders')" />
    <section class="market-panel membership-panel"><div><h2>{{ t('creatorMarketplace.membership') }}</h2><p class="market-muted">{{ t('creatorMarketplace.membershipNote') }}</p></div><t-button theme="default" @click="manageMembership">{{ t('creatorMarketplace.manageMembership') }}</t-button></section>
    <div class="market-tabs" role="tablist"><button type="button" role="tab" :aria-selected="tab === 'subscriptions'" @click="tab = 'subscriptions'">{{ t('creatorMarketplace.mySubscriptions') }}</button><button type="button" role="tab" :aria-selected="tab === 'transactions'" @click="tab = 'transactions'">{{ t('creatorMarketplace.paymentHistory') }}</button><t-button variant="text" :loading="loading" @click="load">{{ t('creatorMarketplace.refresh') }}</t-button></div>
    <div v-if="loading && !orders" class="market-empty">{{ t('common.loading') }}</div>
    <div v-else-if="failed" class="market-error" role="alert"><span>{{ t('creatorMarketplace.loadFailed') }}</span><t-button theme="default" @click="load">{{ t('creatorMarketplace.retry') }}</t-button></div>
    <template v-else-if="orders">
      <template v-if="tab === 'subscriptions'">
        <p v-if="!orders.subscriptions.length" class="market-empty">{{ t('creatorMarketplace.noSubscriptions') }} <RouterLink class="market-link" to="/platform/marketplace">{{ t('creatorMarketplace.browse') }}</RouterLink></p>
        <article v-for="subscription in orders.subscriptions" :key="subscription.id" class="market-panel subscription-row">
          <div><h2><RouterLink class="market-link" :to="`/platform/marketplace/${subscription.product_id}`">{{ subscription.product_title }}</RouterLink></h2><div class="market-actions"><span class="market-badge" :class="{ 'market-badge--active': subscription.can_chat }">{{ t(marketStatusKey(subscription.status === 'pending' ? 'pending_payment' : subscription.status)) }}</span><span class="market-muted">{{ formatMarketPrice(subscription.amount, subscription.currency, locale) }} {{ t(subscription.billing_period === 'yearly' ? 'creatorMarketplace.perYear' : 'creatorMarketplace.perMonth') }}</span></div><p v-if="subscription.can_chat" class="market-note">{{ t(subscription.cancel_at_period_end ? 'creatorMarketplace.cancelScheduled' : 'creatorMarketplace.availableUntil', { date: formatMarketDate(subscription.paid_through, locale) }) }}</p></div>
          <div class="market-actions"><t-button v-if="subscription.can_chat" @click="startChat(subscription.product_id)">{{ t('creatorMarketplace.startChat') }}</t-button><t-button v-if="subscription.portal_available" theme="default" :loading="portalId === subscription.id" @click="openPortal(subscription.id)">{{ t('creatorMarketplace.manageSubscription') }}</t-button></div>
        </article>
      </template>
      <template v-else>
        <p v-if="!orders.transactions.length" class="market-empty">{{ t('creatorMarketplace.noTransactions') }}</p>
        <div v-else class="market-table-wrap"><table class="market-table"><thead><tr><th>{{ t('creatorMarketplace.product') }}</th><th>{{ t('creatorMarketplace.date') }}</th><th>{{ t('creatorMarketplace.amount') }}</th><th>{{ t('creatorMarketplace.statusLabel') }}</th></tr></thead><tbody><tr v-for="transaction in orders.transactions" :key="transaction.id"><td><RouterLink class="market-link" :to="`/platform/marketplace/${transaction.product_id}`">{{ transaction.product_title }}</RouterLink><small>{{ t('creatorMarketplace.reference') }}: {{ transaction.id }}</small></td><td>{{ formatMarketDate(transaction.occurred_at, locale) }}</td><td>{{ formatMarketPrice(Number(transaction.amount), transaction.currency, locale) }}<small>{{ t(transaction.billing_period === 'yearly' ? 'creatorMarketplace.yearly' : 'creatorMarketplace.monthly') }}</small></td><td><span class="market-badge">{{ t(marketStatusKey(transaction.status)) }}</span></td></tr></tbody></table></div>
      </template>
    </template>
  </div></main>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { listMarketplaceOrders, createMarketplacePortal, type MarketplaceOrdersResponse } from '@/api/creator-marketplace'
import MarketplaceHeader from './MarketplaceHeader.vue'
import { formatMarketPrice, formatMarketDate, marketStatusKey } from './marketplacePresentation'
import './marketplace.css'
const { t, locale } = useI18n()
const router = useRouter()
const tab = ref<'subscriptions' | 'transactions'>('subscriptions')
const orders = ref<MarketplaceOrdersResponse | null>(null)
const loading = ref(false)
const failed = ref(false)
const portalId = ref('')
let disposed = false
async function load() {
  if (loading.value) return
  loading.value = true; failed.value = false
  try { const result = await listMarketplaceOrders(); if (!disposed) orders.value = result }
  catch { if (!disposed) failed.value = true }
  finally { if (!disposed) loading.value = false }
}
function manageMembership() {
  void router.push('/platform/settings?section=usage')
}
function startChat(productId: string) { void router.push({ path: '/platform/creatChat', query: { marketplace_product: productId } }) }
async function openPortal(id: string) {
  if (portalId.value) return
  portalId.value = id
  try { const result = await createMarketplacePortal(id); if (!result.authorization_url) throw new Error('Missing portal URL'); window.location.assign(result.authorization_url) }
  catch { MessagePlugin.error(t('creatorMarketplace.portalFailed')) }
  finally { portalId.value = '' }
}
onMounted(() => { void load(); window.addEventListener('focus', load) })
onUnmounted(() => { disposed = true; window.removeEventListener('focus', load) })
</script>
<style scoped>
.membership-panel, .subscription-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.market-tabs .t-button { margin-left: auto; }
.subscription-row h2 a { font-size: 16px; font-weight: 600; }
@media(max-width:760px) { .membership-panel, .subscription-row { flex-direction: column; align-items: flex-start; } }
</style>
