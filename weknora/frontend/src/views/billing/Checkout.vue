<template>
  <div class="checkout-page">
    <header class="checkout-page__topbar">
      <button type="button" class="checkout-page__brand" :aria-label="$t('entitlement.backToProduct')" @click="leaveCheckout">
        <img src="/musuw-logo.png" alt="" />
      </button>
    </header>

    <main class="checkout-page__main">
      <button type="button" class="checkout-page__back" @click="backToPlans">
        <t-icon name="chevron-left" />
        <span>{{ $t('entitlement.backToPlans') }}</span>
      </button>
      <h1>{{ $t('entitlement.checkoutTitle') }}</h1>

      <div v-if="loading" class="checkout-page__loading">{{ $t('common.loading') }}</div>

      <section v-else-if="completed || syncing || syncDelayed" class="checkout-page__success">
        <span class="checkout-page__success-icon"><t-icon :name="completed ? 'check' : 'time'" /></span>
        <h2>{{ $t(completed ? 'entitlement.checkoutActivatedTitle' : (syncDelayed ? 'entitlement.checkoutSyncDelayedTitle' : 'entitlement.checkoutSuccessTitle')) }}</h2>
        <p>{{ $t(completed ? 'entitlement.checkoutActivatedDescription' : (syncDelayed ? 'entitlement.checkoutSyncDelayedDescription' : 'entitlement.checkoutSuccessDescription')) }}</p>
        <div class="checkout-page__success-actions">
          <button type="button" @click="leaveCheckout">{{ $t('entitlement.returnToProduct') }}</button>
          <button v-if="syncDelayed" type="button" class="is-secondary" @click="refreshAfterPayment">{{ $t('entitlement.refreshStatus') }}</button>
        </div>
      </section>

      <p v-else-if="errorMessage" class="checkout-page__error">{{ errorMessage }}</p>

      <section v-else-if="entitlement && targetPlan" class="checkout-page__layout">
        <div class="checkout-page__payment">
          <template v-if="entitlement.plan === 'free'">
            <h2>{{ $t('entitlement.quickPayment') }}</h2>
            <p>{{ $t('entitlement.secureCheckoutLoading') }}</p>
            <p v-if="checkoutAttemptError" class="checkout-page__attempt-error" role="alert">
              {{ checkoutAttemptError }}
            </p>
            <div class="paddle-inline-target" />
          </template>

          <template v-else>
            <h2>{{ $t('entitlement.upgradeConfirmTitle', { plan: planName }) }}</h2>
            <p>{{ $t('entitlement.upgradePaidDescription') }}</p>
            <div class="checkout-page__saved-payment">
              <t-icon name="secured" />
              <span>{{ $t('entitlement.upgradePaymentMethod') }}</span>
            </div>
            <button type="button" class="checkout-page__confirm-upgrade" :disabled="upgradeSubmitting" @click="confirmUpgrade">
              {{ $t('entitlement.upgradeConfirm') }}
            </button>
          </template>

          <p class="checkout-page__trust">
            {{ $t('entitlement.checkoutSecureNote') }}
            <a href="https://musuw.com/refund-policy" target="_blank" rel="noopener noreferrer">{{ $t('entitlement.refundPolicy') }}</a>
          </p>
        </div>

        <aside class="checkout-page__summary">
          <h2>{{ planName }} {{ $t('entitlement.planSuffix') }}</h2>
          <p>{{ $t(`entitlement.planDescriptions.${targetPlan}`) }}</p>
          <strong class="checkout-page__summary-label">{{ $t('entitlement.includes') }}</strong>
          <ul>
            <li v-for="feature in planFeatures" :key="feature">
              <t-icon name="check" />
              <span>{{ feature }}</span>
            </li>
          </ul>
          <div class="checkout-page__totals">
            <div v-if="upgradePreview" class="is-recurring">
              <span>
                {{ period === 'monthly' ? $t('entitlement.nextMonthlyCharge') : $t('entitlement.nextYearlyCharge') }}
                <small>{{ $t('entitlement.nextChargeOn', { date: nextBilledDate }) }}</small>
              </span>
              <strong>{{ displayRecurringTotal }}</strong>
            </div>
            <div>
              <span>{{ upgradePreview ? $t('entitlement.proratedSubtotal') : (period === 'monthly' ? $t('entitlement.monthly') : $t('entitlement.yearly')) }}</span>
              <strong>{{ displaySubtotal }}</strong>
            </div>
            <div><span>{{ $t('entitlement.estimatedTax') }}</span><strong>{{ displayTax }}</strong></div>
            <div class="is-total"><span>{{ $t('entitlement.totalToday') }}</span><strong>{{ displayTotal }}</strong></div>
          </div>
        </aside>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CheckoutEventNames, type PaddleEventData } from '@paddle/paddle-js'
import { useAuthStore } from '@/stores/auth'
import { useChatResourcesStore } from '@/stores/chatResources'
import { useCurrentEntitlementStore } from '@/stores/entitlement'
import {
  createPaddleCheckoutIntent,
  previewPaddleSubscriptionUpgrade,
  upgradePaddleSubscription,
  type BillingPeriod,
  type PaddleCheckoutIntent,
  type PaddleSubscriptionUpgradePreview,
  type PaidConsumerPlan,
} from '@/api/entitlement'
import {
  closePaddleCheckout,
  openPaddleInlineCheckout,
  previewPaddlePrices,
} from '@/utils/paddleCheckout'

interface CheckoutTotals {
  currency: string
  subtotal: number
  tax: number
  total: number
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const chatResources = useChatResourcesStore()
const entitlementStore = useCurrentEntitlementStore()
const { entitlement, billing } = storeToRefs(entitlementStore)
const { locale, t } = useI18n()
const loading = ref(true)
const completed = ref(false)
const syncing = ref(false)
const syncDelayed = ref(false)
const errorMessage = ref('')
const checkoutAttemptError = ref('')
const totals = ref<CheckoutTotals | null>(null)
const previewSubtotal = ref('')
const previewPrice = ref('')
const upgradePreview = ref<PaddleSubscriptionUpgradePreview | null>(null)
const upgradeSubmitting = ref(false)
const upgradeOperationKey = ref<string | null>(null)
const checkoutOperationKey = ref<string | null>(null)
const checkoutIntent = ref<PaddleCheckoutIntent | null>(null)
let checkoutIntentRequest: Promise<PaddleCheckoutIntent> | null = null
const period = computed<BillingPeriod>(() => route.query.period === 'yearly' ? 'yearly' : 'monthly')
const targetPlan = computed<PaidConsumerPlan | null>(() => {
  const value = route.query.plan
  return value === 'plus' || value === 'pro' || value === 'max' ? value : null
})
const planName = computed(() => targetPlan.value ? t(`entitlement.plans.${targetPlan.value}`) : '')
const planRank: Record<string, number> = { free: 0, plus: 1, pro: 2, max: 3 }
// The backend protects every billing mutation. Keep direct `/checkout`
// navigation equally clear for ordinary members and avoid starting any
// provider operation that the server will reject.
const canManageBilling = computed(() => authStore.hasRole('admin'))

const formatMinorCurrency = (amount: number | string, currencyCode: string) => {
  try {
    const formatter = new Intl.NumberFormat(locale.value, { style: 'currency', currency: currencyCode })
    const minorAmount = Number(amount)
    if (!Number.isSafeInteger(minorAmount)) return `${amount} ${currencyCode}`
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return formatter.format(minorAmount / (10 ** fractionDigits))
  } catch {
    return `${amount} ${currencyCode}`
  }
}

const formatCheckoutCurrency = (amount: number, currencyCode: string) => {
  try {
    return new Intl.NumberFormat(locale.value, { style: 'currency', currency: currencyCode }).format(amount)
  } catch {
    return `${amount} ${currencyCode}`
  }
}

const displaySubtotal = computed(() => {
  if (totals.value) return formatCheckoutCurrency(totals.value.subtotal, totals.value.currency)
  if (upgradePreview.value) return formatMinorCurrency(upgradePreview.value.prorated_subtotal, upgradePreview.value.currency_code)
  return previewSubtotal.value || '…'
})
const displayTax = computed(() => {
  if (totals.value) return formatCheckoutCurrency(totals.value.tax, totals.value.currency)
  if (upgradePreview.value) return formatMinorCurrency(upgradePreview.value.prorated_tax, upgradePreview.value.currency_code)
  return t('entitlement.calculatedAtCheckout')
})
const displayTotal = computed(() => {
  if (totals.value) return formatCheckoutCurrency(totals.value.total, totals.value.currency)
  if (upgradePreview.value) return formatMinorCurrency(upgradePreview.value.due_today, upgradePreview.value.currency_code)
  return previewPrice.value || '…'
})
const displayRecurringTotal = computed(() => upgradePreview.value
  ? formatMinorCurrency(upgradePreview.value.recurring_total, upgradePreview.value.currency_code)
  : '')
const nextBilledDate = computed(() => {
  const value = upgradePreview.value?.next_billed_at
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
})
const planFeatures = computed(() => {
  const plan = targetPlan.value
  if (!plan) return []
  const storage = { plus: 10, pro: 30, max: 100 }[plan]
  return [
    t('entitlement.featureStorage', { amount: storage }),
    t('entitlement.featureUnlimitedKnowledge'),
    t('entitlement.featureAllModels'),
    t('entitlement.featureVideo'),
  ]
})

const getUpgradeOperationKey = (): string => {
  if (upgradeOperationKey.value) return upgradeOperationKey.value
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    upgradeOperationKey.value = crypto.randomUUID()
  } else {
    upgradeOperationKey.value = `upgrade-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
  return upgradeOperationKey.value
}

const getCheckoutOperationKey = (): string => {
  if (checkoutOperationKey.value) return checkoutOperationKey.value
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    checkoutOperationKey.value = crypto.randomUUID()
  } else {
    checkoutOperationKey.value = `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
  return checkoutOperationKey.value
}

const getPaddleCheckoutIntent = async (plan: PaidConsumerPlan, billingPeriod: BillingPeriod): Promise<PaddleCheckoutIntent> => {
  if (checkoutIntent.value) return checkoutIntent.value
  if (!checkoutIntentRequest) {
    checkoutIntentRequest = createPaddleCheckoutIntent({
      plan,
      billingPeriod,
      operationKey: getCheckoutOperationKey(),
    })
  }
  try {
    const response = await checkoutIntentRequest
    if (!response?.transaction_id) throw new Error('Paddle checkout input unavailable')
    checkoutIntent.value = response
    return response
  } catch (error) {
    checkoutIntentRequest = null
    checkoutOperationKey.value = null
    throw error
  }
}

const handlePaddleEvent = (event: PaddleEventData) => {
  const data = event.data
  if (data?.currency_code && data.totals) {
    totals.value = {
      currency: data.currency_code,
      subtotal: data.totals.subtotal,
      tax: data.totals.tax,
      total: data.totals.total,
    }
  }
  if (
    event.name === CheckoutEventNames.CHECKOUT_FAILED
    || event.name === CheckoutEventNames.CHECKOUT_PAYMENT_FAILED
    || event.name === CheckoutEventNames.CHECKOUT_PAYMENT_ERROR
  ) {
    checkoutAttemptError.value = t('entitlement.checkoutPaymentFailed')
    return
  }
  if (event.name === CheckoutEventNames.CHECKOUT_ERROR) {
    errorMessage.value = t('entitlement.checkoutLoadFailed')
  }
}

let syncRun = 0
const refreshAfterPayment = async () => {
  if (syncing.value || completed.value) return
  const run = ++syncRun
  syncDelayed.value = false
  syncing.value = true
  for (const delay of [700, 1200, 1800, 2500, 3500]) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, delay))
    if (run !== syncRun) return
    try {
      await entitlementStore.refresh()
      if (entitlement.value?.plan === targetPlan.value) {
        chatResources.invalidate('models')
        syncing.value = false
        completed.value = true
        return
      }
    } catch {
      // The signed Paddle webhook remains authoritative; retry briefly.
    }
  }
  if (run !== syncRun) return
  syncing.value = false
  syncDelayed.value = true
}

const mountCheckout = async () => {
  const plan = targetPlan.value
  const config = billing.value
  if (!plan || !config?.configured || !config.environment || !config.client_token) {
    throw new Error('Billing unavailable')
  }
  const option = config.catalog?.[plan]?.[period.value]
  if (!option?.price_id) throw new Error('Plan unavailable')
  try {
    const [preview] = await previewPaddlePrices({
      environment: config.environment,
      clientToken: config.client_token,
      pwCustomerId: config.pw_customer_id,
      priceIds: [option.price_id],
    })
    previewSubtotal.value = preview?.formattedSubtotal || ''
    previewPrice.value = preview?.formattedTotal || ''
  } catch {
    // Paddle checkout itself remains authoritative and can still load.
  }
  const intent = await getPaddleCheckoutIntent(plan, period.value)
  await nextTick()
  await openPaddleInlineCheckout({
    environment: config.environment,
    clientToken: config.client_token,
    pwCustomerId: config.pw_customer_id,
    transactionId: intent.transaction_id,
    email: authStore.user?.email,
    locale: locale.value,
    frameTarget: 'paddle-inline-target',
    onEvent: handlePaddleEvent,
    onCompleted: refreshAfterPayment,
  })
}

const initializeCheckout = async () => {
  const plan = targetPlan.value
  if (!plan) {
    await router.replace('/plans')
    return
  }
  if (!canManageBilling.value) {
    errorMessage.value = t('entitlement.billingAdminOnly')
    loading.value = false
    return
  }
  loading.value = true
  try {
    await entitlementStore.refresh()
    if (!entitlement.value || !billing.value) throw new Error('Entitlement unavailable')
    if (planRank[plan] <= planRank[entitlement.value.plan]) {
      await router.replace('/plans')
      return
    }
    loading.value = false
    if (entitlement.value.plan === 'free') await mountCheckout()
    else upgradePreview.value = await previewPaddleSubscriptionUpgrade(plan)
  } catch {
    errorMessage.value = t('entitlement.checkoutLoadFailed')
  } finally {
    loading.value = false
  }
}

const confirmUpgrade = async () => {
  const plan = targetPlan.value
  if (!plan || upgradeSubmitting.value) return
  upgradeSubmitting.value = true
  try {
    await upgradePaddleSubscription(plan, getUpgradeOperationKey())
    void refreshAfterPayment()
  } catch {
    upgradeOperationKey.value = null
    errorMessage.value = t('entitlement.upgradeFailed')
  } finally {
    upgradeSubmitting.value = false
  }
}

const backToPlans = () => { void router.push({ path: '/plans', query: { plan: targetPlan.value || undefined, period: period.value } }) }
const leaveCheckout = () => {
  chatResources.invalidate('models')
  if (completed.value || syncing.value || syncDelayed.value) {
    entitlementStore.invalidate()
    void entitlementStore.ensureFresh()
  }
  void router.push('/platform/knowledge-bases')
}

onMounted(() => { void initializeCheckout() })
onUnmounted(() => {
  syncRun++
  void closePaddleCheckout()
})
</script>

<style scoped lang="less">
.checkout-page { min-height: 100dvh; background: #fff; color: #0d0d0d; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.checkout-page__topbar { height: 82px; padding: 0 44px; display: flex; align-items: center; border-bottom: 1px solid #ededed; }
.checkout-page__brand { width: 50px; height: 50px; padding: 4px; display: grid; place-items: center; border: 0; background: transparent; cursor: pointer; }
.checkout-page__brand img { width: 100%; height: 100%; object-fit: contain; }
.checkout-page__main { width: min(1320px,calc(100% - 80px)); margin: 0 auto; padding: 48px 0 64px; }
.checkout-page__back { height: 38px; padding: 0; display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; color: #4e4e4e; font: inherit; font-size: 15px; cursor: pointer; }
.checkout-page__main > h1 { margin: 10px 0 42px; font-size: clamp(36px,4vw,52px); line-height: 1.1; font-weight: 600; letter-spacing: -.04em; }
.checkout-page__loading,.checkout-page__error { margin-top: 70px; color: #666; text-align: center; }
.checkout-page__layout { display: grid; grid-template-columns: minmax(0,1fr) 440px; gap: 72px; align-items: start; }
.checkout-page__payment { min-width: 0; padding-top: 4px; }
.checkout-page__payment > h2 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 650; }
.checkout-page__payment > p { margin: 8px 0 24px; color: #747474; font-size: 14px; line-height: 22px; }
.checkout-page__payment > .checkout-page__attempt-error { margin: -8px 0 18px; padding: 12px 14px; border: 1px solid #f1c4c4; border-radius: 12px; background: #fff7f7; color: #a32121; }
.paddle-inline-target { width: 100%; min-height: 640px; }
.checkout-page__summary { padding: 34px 34px 30px; border: 1px solid #dedede; border-radius: 24px; background: #fff; }
.checkout-page__summary h2 { margin: 0; font-size: 30px; line-height: 38px; font-weight: 600; letter-spacing: -.03em; }
.checkout-page__summary > p { margin: 12px 0 26px; color: #606060; font-size: 14px; line-height: 22px; }
.checkout-page__summary-label { font-size: 13px; }
.checkout-page__summary ul { margin: 18px 0 0; padding: 0; display: grid; gap: 15px; list-style: none; }
.checkout-page__summary li { display: grid; grid-template-columns: 20px 1fr; gap: 10px; align-items: start; font-size: 14px; line-height: 21px; }
.checkout-page__summary li :deep(.t-icon) { margin-top: 2px; color: #1668dc; font-size: 17px; }
.checkout-page__totals { margin-top: 34px; padding-top: 22px; display: grid; gap: 13px; border-top: 1px solid #dedede; }
.checkout-page__totals > div { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; color: #5f5f5f; font-size: 14px; }
.checkout-page__totals .is-recurring > span { display: grid; gap: 3px; }
.checkout-page__totals .is-recurring small { color: #8b8b8b; font-size: 11px; }
.checkout-page__totals strong { color: #242424; font-weight: 500; }
.checkout-page__totals .is-total { margin-top: 5px; color: #111; font-size: 17px; font-weight: 650; }
.checkout-page__totals .is-total strong { font-size: 20px; font-weight: 650; }
.checkout-page__saved-payment { min-height: 64px; padding: 0 18px; display: flex; align-items: center; gap: 12px; border: 1px solid #dedede; border-radius: 14px; background: #fafafa; color: #333; font-size: 14px; }
.checkout-page__saved-payment :deep(.t-icon) { font-size: 21px; }
.checkout-page__confirm-upgrade { width: 100%; min-height: 50px; margin-top: 18px; border: 0; border-radius: 999px; background: #0d0d0d; color: #fff; font: inherit; font-size: 15px; font-weight: 650; cursor: pointer; }
.checkout-page__confirm-upgrade:disabled { opacity: .55; cursor: wait; }
.checkout-page__trust { margin-top: 22px !important; color: #7c7c7c !important; font-size: 12px !important; line-height: 18px !important; }
.checkout-page__trust a { margin-left: 5px; color: #333; }
.checkout-page__success { max-width: 560px; margin: 90px auto 0; display: grid; justify-items: center; text-align: center; }
.checkout-page__success-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 999px; background: #111; color: #fff; font-size: 23px; }
.checkout-page__success h2 { margin: 20px 0 0; font-size: 28px; }
.checkout-page__success p { margin: 10px 0 0; color: #666; line-height: 24px; }
.checkout-page__success-actions { margin-top: 26px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.checkout-page__success button { min-height: 44px; padding: 0 24px; border: 1px solid #111; border-radius: 999px; background: #111; color: #fff; font: inherit; font-weight: 650; cursor: pointer; }
.checkout-page__success button.is-secondary { background: #fff; color: #111; }
@media (max-width: 920px) { .checkout-page__layout { grid-template-columns: 1fr; gap: 34px; } .checkout-page__summary { order: -1; } }
@media (max-width: 640px) { .checkout-page__topbar { height: 68px; padding: 0 16px; } .checkout-page__main { width: min(100% - 28px,1320px); padding-top: 30px; } .checkout-page__main > h1 { margin-bottom: 30px; } .checkout-page__summary { padding: 26px 22px; border-radius: 18px; } }
</style>
