<template>
  <t-dialog :visible="true" :header="t('creatorMarketplace.checkoutTitle', { title: product.title })" width="780px" :footer="false" :close-on-overlay-click="false" class="market-dialog" @close="emit('close')">
    <p class="market-muted">{{ t('creatorMarketplace.secureCheckout') }}</p>
    <div v-if="activated || confirming || delayed" class="market-panel" role="status">
      <h2>{{ t(activated ? 'creatorMarketplace.paymentActivated' : delayed ? 'creatorMarketplace.paymentSyncDelayed' : 'creatorMarketplace.pendingPayment') }}</h2>
      <p class="market-note">{{ t('creatorMarketplace.paymentSyncNote') }}</p>
      <div class="market-actions">
        <t-button v-if="activated" @click="emit('activated')">{{ t('creatorMarketplace.startChat') }}</t-button>
        <t-button v-if="delayed" theme="default" :loading="confirming" @click="confirmAccess">{{ t('creatorMarketplace.refresh') }}</t-button>
        <RouterLink class="market-link" to="/platform/orders">{{ t('creatorMarketplace.orders') }}</RouterLink>
      </div>
    </div>
    <template v-else>
      <p v-if="opening" class="market-note" role="status">{{ t('common.loading') }}</p>
      <div v-if="failed" class="market-error" role="alert"><span>{{ t('creatorMarketplace.checkoutFailed') }}</span><t-button theme="default" :loading="opening" @click="openCheckout">{{ t('creatorMarketplace.checkoutRetry') }}</t-button></div>
      <div class="marketplace-paddle-target" />
    </template>
    <p class="market-note">{{ t('creatorMarketplace.renewalNote') }} {{ t('creatorMarketplace.allowanceNote') }}</p>
  </t-dialog>
</template>
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckoutEventNames } from '@paddle/paddle-js'
import { createMarketplaceCheckout, getMarketplaceProduct, type MarketplaceProduct, type MarketplaceBillingPeriod, type MarketplaceCheckoutIntent } from '@/api/creator-marketplace'
import { openPaddleInlineCheckout, closePaddleCheckout } from '@/utils/paddleCheckout'
const props = defineProps<{ product: MarketplaceProduct; period: MarketplaceBillingPeriod }>()
const emit = defineEmits<{ close: []; activated: [] }>()
const { t, locale } = useI18n()
const opening = ref(false)
const failed = ref(false)
const confirming = ref(false)
const delayed = ref(false)
const activated = ref(false)
let disposed = false
let intent: MarketplaceCheckoutIntent | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let resolveDelay: (() => void) | undefined
// The same retry uses the same operation key. Browser completion never grants access.
const operationKey = crypto.randomUUID()
const waitForConfirmation = () => new Promise<void>(resolve => {
  resolveDelay = resolve
  timer = setTimeout(() => { timer = undefined; resolveDelay = undefined; resolve() }, 2000)
})
async function confirmAccess() {
  if (confirming.value || disposed) return
  confirming.value = true; delayed.value = false
  try {
    for (let attempt = 0; attempt < 10 && !disposed; attempt++) {
      try {
        const current = await getMarketplaceProduct(props.product.id)
        if (disposed) return
        if (current.access?.can_chat) { activated.value = true; return }
      } catch { /* The signed webhook may still be settling. */ }
      if (attempt < 9) await waitForConfirmation()
    }
    if (!disposed) delayed.value = true
  } finally { if (!disposed) confirming.value = false }
}
async function openCheckout() {
  if (opening.value || disposed) return
  opening.value = true; failed.value = false
  try {
    intent ||= await createMarketplaceCheckout(props.product.id, props.period, operationKey)
    if (disposed) return
    if (!intent.configured || !intent.transaction_id || !intent.client_token) throw new Error('Checkout unavailable')
    await nextTick()
    await openPaddleInlineCheckout({
      transactionId: intent.transaction_id,
      environment: intent.environment,
      clientToken: intent.client_token,
      locale: locale.value,
      frameTarget: 'marketplace-paddle-target',
      onCompleted: () => { if (!disposed) void confirmAccess() },
      onEvent: event => {
        if (disposed) return
        // Paddle owns payment-decline feedback and retry inside the existing checkout.
        if (event.name === CheckoutEventNames.CHECKOUT_ERROR) failed.value = true
      },
    })
  } catch { if (!disposed) failed.value = true }
  finally { if (!disposed) opening.value = false }
}
onMounted(openCheckout)
onUnmounted(() => {
  disposed = true
  if (timer) clearTimeout(timer)
  resolveDelay?.()
  void closePaddleCheckout()
})
</script>
<style scoped>
.marketplace-paddle-target { min-height: 580px; width: 100%; }
.market-actions { margin-top: 18px; }
</style>
