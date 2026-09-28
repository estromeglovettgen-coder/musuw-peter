<template>
  <div class="plans-page">
    <header class="plans-page__topbar">
      <button type="button" class="plans-page__brand" :aria-label="$t('entitlement.backToProduct')" @click="leavePlans">
        <img src="/musuw-logo.png" alt="" />
      </button>
    </header>

    <main class="plans-page__main">
      <section class="plans-page__intro">
        <h1>{{ $t('entitlement.pricingTitle') }}</h1>
        <p>{{ $t('entitlement.pricingDescription') }}</p>
        <div class="plans-page__period" role="group" :aria-label="$t('entitlement.choosePeriod')">
          <button type="button" :class="{ 'is-active': period === 'monthly' }" :aria-pressed="period === 'monthly'" @click="period = 'monthly'">{{ $t('entitlement.monthly') }}</button>
          <button type="button" :class="{ 'is-active': period === 'yearly' }" :aria-pressed="period === 'yearly'" @click="period = 'yearly'">{{ $t('entitlement.yearly') }}</button>
        </div>
      </section>

      <div v-if="loading" class="plans-page__loading">{{ $t('common.loading') }}</div>

      <template v-else-if="entitlement">
        <section class="plans-page__grid" :style="{ '--plan-columns': planCards.length }" :aria-label="$t('entitlement.pricingTitle')">
          <article
            v-for="card in planCards"
            :key="card.plan"
            class="plan-card"
            :class="{
              'is-current': card.plan === entitlement.plan,
              'is-recommended': card.plan === recommendedPlan,
              'is-target': card.plan === requestedPlan,
            }"
          >
            <div class="plan-card__heading">
              <h2>{{ $t(`entitlement.plans.${card.plan}`) }}</h2>
              <span v-if="card.plan === recommendedPlan">{{ $t('entitlement.recommended') }}</span>
            </div>
            <p class="plan-card__description">{{ $t(card.descriptionKey) }}</p>
            <div class="plan-card__price">
              <strong>{{ planPrice(card.plan) }}</strong>
              <span v-if="card.plan !== 'free'">{{ period === 'monthly' ? $t('entitlement.perMonth') : $t('entitlement.perYear') }}</span>
            </div>
            <button
              type="button"
              class="plan-card__action"
              :class="{ 'is-primary': planActionKind(card.plan) === 'choose' }"
              :disabled="planActionKind(card.plan) !== 'choose'"
              @click="choosePlan(card.plan)"
            >
              {{ planActionLabel(card.plan) }}
            </button>
            <div class="plan-card__divider" />
            <strong class="plan-card__includes">{{ $t('entitlement.includes') }}</strong>
            <ul>
              <li v-for="feature in planFeatures(card.plan)" :key="feature">
                <t-icon name="check" />
                <span>{{ feature }}</span>
              </li>
            </ul>
          </article>
        </section>

        <footer class="plans-page__footer">
          <p v-if="!canManageBilling">{{ $t('entitlement.billingAdminOnly') }}</p>
          <p v-else-if="billingPending">{{ $t('entitlement.billingRenewalPending') }}</p>
          <p v-else-if="!billingConfigured">{{ $t('entitlement.billingNotConfigured') }}</p>
          <p v-else>{{ $t('entitlement.checkoutSecureNote') }}</p>
          <button v-if="canManageBilling && canManageSubscription" type="button" :disabled="portalOpening" @click="handlePortal">
            {{ $t('entitlement.manageBilling') }}
          </button>
        </footer>
      </template>

      <p v-else class="plans-page__error">{{ $t('entitlement.usageUnavailable') }}</p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useCurrentEntitlementStore } from '@/stores/entitlement'
import {
  createPaddlePortalSession,
  type BillingPeriod,
  type ConsumerPlan,
  type PaidConsumerPlan,
} from '@/api/entitlement'
import { previewPaddlePrices } from '@/utils/paddleCheckout'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const entitlementStore = useCurrentEntitlementStore()
const { locale, t } = useI18n()
const { entitlement, billing } = storeToRefs(entitlementStore)
const loading = ref(!entitlement.value)
const pricePreviewLoading = ref(false)
const localizedPrices = ref<Record<string, string>>({})
const portalOpening = ref(false)
const paidPlans: PaidConsumerPlan[] = ['plus', 'pro', 'max']
const planRank: Record<ConsumerPlan, number> = { free: 0, plus: 1, pro: 2, max: 3 }
// The public pricing page currently publishes Chinese and English marketing
// copy only. Keep this one free-plan line byte-for-byte aligned without adding
// unsupported marketing translations to the other locale bundles.
const freeImportFeature = computed(() => locale.value.toLowerCase().startsWith('zh')
  ? '文档与笔记导入'
  : 'Documents and notes')
const planCards: Array<{ plan: ConsumerPlan; descriptionKey: string }> = [
  { plan: 'free', descriptionKey: 'entitlement.planDescriptions.free' },
  { plan: 'plus', descriptionKey: 'entitlement.planDescriptions.plus' },
  { plan: 'pro', descriptionKey: 'entitlement.planDescriptions.pro' },
  { plan: 'max', descriptionKey: 'entitlement.planDescriptions.max' },
]
const recommendedPlan = computed<ConsumerPlan | null>(() => {
  switch (entitlement.value?.plan) {
    case 'free': return 'plus'
    case 'plus': return 'pro'
    case 'pro': return 'max'
    default: return null
  }
})
const initialPeriod = route.query.period === 'yearly' ? 'yearly' : 'monthly'
const period = ref<BillingPeriod>(initialPeriod)
const requestedPlan = computed<ConsumerPlan | null>(() => {
  const plan = route.query.plan
  return plan === 'plus' || plan === 'pro' || plan === 'max' ? plan : null
})
const billingConfigured = computed(() => billing.value?.configured === true)
const portalAvailable = computed(() => billing.value?.portal_available === true)
// This server-owned flag also covers an effective Free plan that still has a
// non-canceled Paddle subscription in dunning. Keep the paid-plan fallback so
// older responses do not hide an existing portal action during rollout.
const canManageSubscription = computed(() => billing.value?.can_manage_billing === true ||
  (entitlement.value?.plan !== 'free' && portalAvailable.value))
// Billing mutations are an Owner/Admin capability. The server remains the
// authority; this gate only keeps ordinary workspace members from seeing
// actions that the guarded endpoints would reject.
const canManageBilling = computed(() => authStore.hasRole('admin'))
const billingPending = computed(() => entitlement.value?.openrouter_credits_status === 'pending' ||
  (entitlement.value?.plan === 'free' && canManageSubscription.value))
const subscriptionUpgradeAvailable = computed(() =>
  canManageBilling.value && billingConfigured.value && portalAvailable.value && entitlement.value?.plan_status === 'active',
)

const loadPrices = async () => {
  const config = billing.value
  if (!config?.configured || !config.environment || !config.client_token) return
  const options = paidPlans
    .map((plan) => config.catalog?.[plan]?.[period.value])
    .filter((option): option is { price_id: string } => Boolean(option?.price_id))
  if (!options.length) return
  pricePreviewLoading.value = true
  try {
    const previews = await previewPaddlePrices({
      environment: config.environment,
      clientToken: config.client_token,
      pwCustomerId: config.pw_customer_id,
      priceIds: options.map((option) => option.price_id),
    })
    const next = { ...localizedPrices.value }
    for (const preview of previews) next[preview.priceId] = preview.formattedTotal
    localizedPrices.value = next
  } catch {
    // The server allow-list still controls checkout if a localized read fails.
  } finally {
    pricePreviewLoading.value = false
  }
}

const loadEntitlement = async () => {
  loading.value = !entitlement.value
  try {
    await entitlementStore.refresh()
    if (entitlement.value && billing.value) await loadPrices()
  } finally {
    loading.value = false
  }
}

watch(period, () => { void loadPrices() })
onMounted(() => { void loadEntitlement() })

const planPrice = (plan: ConsumerPlan) => {
  if (plan === 'free') return t('entitlement.freePrice')
  const priceId = billing.value?.catalog?.[plan]?.[period.value]?.price_id
  if (priceId && localizedPrices.value[priceId]) {
    return localizedPrices.value[priceId]
  }
  return pricePreviewLoading.value ? '…' : t('entitlement.unavailable')
}

const planFeatures = (plan: ConsumerPlan) => {
  const storage = { free: 1, plus: 10, pro: 30, max: 100 }[plan]
  const features = [
    t('entitlement.featureStorage', { amount: storage }),
  ]
  if (plan === 'free') features.push(
    t('entitlement.featureFreeKnowledge'),
    t('entitlement.featureBudgetModel'),
    freeImportFeature.value,
  )
  else features.push(t('entitlement.featureUnlimitedKnowledge'), t('entitlement.featureAllModels'), t('entitlement.featureVideo'))
  return features
}

const hasCheckout = (plan: PaidConsumerPlan) => {
  const priceId = billing.value?.catalog?.[plan]?.[period.value]?.price_id
  return Boolean(canManageBilling.value && billingConfigured.value && priceId)
}

const planActionKind = (plan: ConsumerPlan): 'current' | 'included' | 'choose' | 'unavailable' => {
  const current = entitlement.value?.plan || 'free'
  if (plan === current) return 'current'
  if (plan === 'free' || planRank[plan] < planRank[current]) return 'included'
  // An expired/past_due subscription may be effective Free while Paddle still
  // owns the subscription. Route recovery through the portal; never create a
  // second checkout that the server will reject for the same tenant.
  if (current === 'free') {
    if (canManageSubscription.value) return 'unavailable'
    return hasCheckout(plan as PaidConsumerPlan) ? 'choose' : 'unavailable'
  }
  return subscriptionUpgradeAvailable.value ? 'choose' : 'unavailable'
}

const planActionLabel = (plan: ConsumerPlan) => {
  const kind = planActionKind(plan)
  if (kind === 'current') return t('entitlement.currentPlanAction')
  if (kind === 'included') return t('entitlement.includedInCurrent')
  if (kind === 'choose') return entitlement.value?.plan === 'free'
    ? t('entitlement.choosePlanAction', { plan: t(`entitlement.plans.${plan}`) })
    : t('entitlement.upgradeTo', { plan: t(`entitlement.plans.${plan}`) })
  return t('entitlement.checkoutUnavailable')
}

const choosePlan = (plan: ConsumerPlan) => {
  if (!canManageBilling.value || planActionKind(plan) !== 'choose' || plan === 'free') return
  void router.push({ path: '/checkout', query: { plan, period: period.value } })
}

const handlePortal = async () => {
  if (!canManageBilling.value || !portalAvailable.value || portalOpening.value) return
  portalOpening.value = true
  try {
    const response = await createPaddlePortalSession()
    if (!response.authorization_url) throw new Error('Missing portal URL')
    // Force a fresh entitlement read when returning after portal changes.
    entitlementStore.invalidate()
    window.location.assign(response.authorization_url)
  } catch {
    MessagePlugin.error(t('entitlement.portalUnavailable'))
  } finally {
    portalOpening.value = false
  }
}

const leavePlans = () => { void router.push('/platform/knowledge-bases') }
</script>

<style scoped lang="less">
.plans-page { min-height: 100dvh; background: #fff; color: #0d0d0d; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.plans-page__topbar { height: 82px; padding: 0 44px; display: flex; align-items: center; border-bottom: 1px solid #ededed; }
.plans-page__brand { width: 50px; height: 50px; padding: 4px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; cursor: pointer; }
.plans-page__brand:hover { background: #f2f2f2; }
.plans-page__brand img { width: 100%; height: 100%; object-fit: contain; }
.plans-page__main { width: min(1420px,calc(100% - 48px)); margin: 0 auto; padding: 84px 0 52px; }
.plans-page__intro { max-width: 760px; margin: 0 auto; display: flex; align-items: center; flex-direction: column; text-align: center; }
.plans-page__intro h1 { margin: 0; font-size: clamp(42px,5vw,64px); line-height: 1.05; font-weight: 500; letter-spacing: -.045em; }
.plans-page__intro p { max-width: 680px; margin: 24px 0 0; color: #454545; font-size: 17px; line-height: 26px; }
.plans-page__period { width: min(512px,100%); margin-top: 64px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); padding: 4px; border: 1px solid #dddddd; border-radius: 18px; background: #eeeeee; box-shadow: 0 1px 2px rgb(0 0 0 / 6%); }
.plans-page__period button { min-width: 0; height: 48px; padding: 0 18px; border: 0; border-radius: 14px; background: transparent; color: #767676; font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; }
.plans-page__period button.is-active { background: #fff; color: #0d0d0d; box-shadow: 0 1px 4px rgb(0 0 0 / 10%); }
.plans-page__loading,.plans-page__error { margin-top: 48px; text-align: center; color: #6b6b6b; }
.plans-page__grid { margin-top: 34px; display: grid; grid-template-columns: repeat(var(--plan-columns),minmax(0,1fr)); gap: 22px; }
.plan-card { position: relative; min-width: 0; min-height: 540px; padding: 22px 18px 24px; display: flex; flex-direction: column; border: 1px solid #dedede; border-radius: 4px; background: #fff; }
.plan-card.is-current,.plan-card.is-target { border-color: #0d0d0d; box-shadow: inset 0 0 0 1px #0d0d0d; }
.plan-card__heading { min-height: 31px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.plan-card__heading h2 { margin: 0; font-size: 27px; line-height: 34px; font-weight: 500; letter-spacing: -.035em; }
.plan-card__heading span { padding: 4px 8px; border-radius: 999px; background: #dedede; font-size: 11px; font-weight: 650; }
.plan-card__description { min-height: 50px; margin: 8px 0 0; color: #333; font-size: 15px; line-height: 22px; }
.plan-card__price { min-height: 58px; margin-top: 26px; display: flex; align-items: baseline; gap: 7px; }
.plan-card__price strong { font-size: clamp(34px,3vw,46px); line-height: 52px; font-weight: 500; letter-spacing: -.045em; }
.plan-card__price span { color: #6a6a6a; font-size: 13px; white-space: nowrap; }
.plan-card__action { width: 100%; min-height: 38px; margin-top: 14px; padding: 0 16px; border: 1px solid #d0d0d0; border-radius: 999px; background: #fff; color: #0d0d0d; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.plan-card__action.is-primary { border-color: #0d0d0d; background: #0d0d0d; color: #fff; }
.plan-card__action:disabled { color: #777; background: #f4f4f4; cursor: default; }
.plan-card__divider { height: 1px; margin: 24px 0 20px; background: #dedede; }
.plan-card__includes { font-size: 13px; }
.plan-card ul { margin: 16px 0 0; padding: 0; display: grid; gap: 15px; list-style: none; }
.plan-card li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: start; color: #202020; font-size: 14px; line-height: 20px; }
.plan-card li :deep(.t-icon) { margin-top: 2px; font-size: 15px; }
.plans-page__footer { max-width: 720px; margin: 24px auto 0; display: grid; justify-items: center; gap: 10px; text-align: center; color: #6b6b6b; font-size: 12px; line-height: 18px; }
.plans-page__footer p { margin: 0; }
.plans-page__footer button { border: 0; background: transparent; color: #111; font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
@media (max-width: 1040px) { .plans-page__grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 640px) { .plans-page__topbar { height: 68px; padding: 0 16px; } .plans-page__main { width: min(100% - 28px,1420px); padding-top: 48px; } .plans-page__intro h1 { font-size: 42px; } .plans-page__intro p { margin-top: 18px; font-size: 15px; line-height: 23px; } .plans-page__period { margin-top: 38px; } .plans-page__grid { grid-template-columns: 1fr; margin-top: 24px; } .plan-card { min-height: 0; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
