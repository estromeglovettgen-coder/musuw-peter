<template>
  <section class="usage-billing">
    <header class="visual-settings-page-header">
      <div class="visual-settings-page-header__copy">
        <h2 class="visual-settings-page-header__title">{{ $t('entitlement.usageTitle') }}</h2>
      </div>
    </header>

    <div v-if="entitlementLoading && !entitlement" class="usage-billing__loading">{{ $t('common.loading') }}</div>

    <div v-else-if="entitlement" class="usage-billing__rows" :aria-busy="entitlementLoading">
      <div class="usage-billing__row usage-billing__row--split">
        <strong class="usage-billing__quota-title">{{ $t('entitlement.currentPlan') }}</strong>
        <div class="usage-billing__actions">
          <span class="usage-billing__plan-name">{{ planName }}</span>
          <button type="button" class="usage-billing__secondary" @click="openPlans">
            {{ entitlement.plan === 'free' ? $t('entitlement.upgradePlan') : $t('entitlement.viewPlans') }}
          </button>
        </div>
      </div>

      <div v-if="entitlement.plan !== 'free' && portalAvailable" class="usage-billing__row usage-billing__row--split">
        <div class="usage-billing__copy">
          <strong class="usage-billing__quota-title">{{ $t('entitlement.manageBilling') }}</strong>
          <small>{{ $t('entitlement.manageDescription') }}</small>
        </div>
        <button type="button" class="usage-billing__secondary" :disabled="portalOpening" @click="handlePortal">
          {{ $t('entitlement.managePlan') }}
        </button>
      </div>

      <div v-if="entitlement.openrouter_credits_status === 'pending'" class="usage-billing__row usage-billing__row--split">
        <small class="usage-billing__notice">{{ $t('entitlement.billingRenewalPending') }}</small>
        <button type="button" class="usage-billing__secondary" @click="openPlans">{{ $t('entitlement.viewPlans') }}</button>
      </div>

      <div class="usage-billing__row usage-billing__row--meter">
        <div class="usage-billing__copy">
          <strong class="usage-billing__quota-title">{{ $t('entitlement.monthlyAllowance') }}</strong>
          <small v-if="formattedResetAt">{{ $t('entitlement.resetsAt', { month: formattedResetAt }) }}</small>
        </div>
        <div class="usage-billing__meter-control">
          <div class="usage-billing__meter-meta">
            <strong v-if="creditsRemainingPercent !== null">{{ creditsRemainingPercent }}% {{ $t('entitlement.remaining') }}</strong>
            <strong v-else class="is-muted">{{ entitlement.openrouter_credits_status === 'pending' ? $t('entitlement.billingPendingShort') : $t('entitlement.unavailable') }}</strong>
          </div>
          <div class="usage-billing__meter" role="progressbar" :aria-valuenow="creditsRemainingPercent ?? undefined" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${creditsRemainingPercent ?? 0}%` }" />
          </div>
        </div>
      </div>

      <div v-if="storageRemainingPercent !== null" class="usage-billing__row usage-billing__row--meter">
        <div class="usage-billing__copy">
          <strong class="usage-billing__quota-title">{{ $t('entitlement.storage') }}</strong>
          <small class="usage-billing__storage-usage">{{ $t('entitlement.storageUsage', { used: formattedStorageUsed, total: formattedStorageTotal }) }}</small>
        </div>
        <div class="usage-billing__meter-control">
          <div class="usage-billing__meter-meta">
            <strong>{{ storageRemainingPercent }}% {{ $t('entitlement.remaining') }}</strong>
          </div>
          <div class="usage-billing__meter" role="progressbar" :aria-valuenow="storageRemainingPercent" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${Math.max(4, storageRemainingPercent)}%` }" />
          </div>
        </div>
      </div>

      <div v-if="!authStore.isLiteMode" class="usage-billing__row is-compact"><span>{{ $t('entitlement.knowledgeBases') }}</span><strong>{{ formatLimit(entitlement.max_knowledge_bases) }}</strong></div>
      <div v-if="!authStore.isLiteMode" class="usage-billing__row is-compact"><span>{{ $t('entitlement.documentsPerKb') }}</span><strong>{{ formatLimit(entitlement.max_documents_per_kb) }}</strong></div>
      <div v-if="!authStore.isLiteMode" class="usage-billing__row is-compact"><span>{{ $t('entitlement.videoAccess') }}</span><strong>{{ entitlement.video_upload ? $t('entitlement.included') : $t('entitlement.notIncluded') }}</strong></div>
    </div>

    <p v-else class="usage-billing__notice">{{ $t('entitlement.usageUnavailable') }}</p>
    <div class="usage-billing__row usage-billing__row--split"><strong class="usage-billing__quota-title">{{ $t('creatorMarketplace.orders') }}</strong><button type="button" class="usage-billing__secondary" @click="router.push('/platform/orders')">{{ $t('creatorMarketplace.orders') }}</button></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import {
  createPaddlePortalSession,
} from '@/api/entitlement'
import { useAuthStore } from '@/stores/auth'
import { useCurrentEntitlementStore } from '@/stores/entitlement'

const { locale, t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const entitlementStore = useCurrentEntitlementStore()
const { entitlement, billing, loading: entitlementLoading } = storeToRefs(entitlementStore)
const portalOpening = ref(false)

const planName = computed(() => t(`entitlement.plans.${entitlement.value?.plan || 'free'}`))
const clampPercent = (value: number) => Math.round(Math.max(0, Math.min(100, value)))
const creditsRemainingPercent = computed<number | null>(() => {
  const data = entitlement.value
  if (!data || data.openrouter_credits_status === 'unavailable' || data.openrouter_credits_status === 'pending') return null
  if (data.openrouter_credits_status === 'unprovisioned') return 100
  const total = Number(data.monthly_openrouter_microusd)
  const remaining = Number(data.openrouter_remaining_microusd)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining)) return null
  return clampPercent((remaining / total) * 100)
})
const storageRemainingPercent = computed<number | null>(() => {
  const data = entitlement.value
  if (!data) return null
  const total = Number(data.storage_bytes)
  const used = Number(data.storage_used)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return null
  return clampPercent(((total - used) / total) * 100)
})
const formatStorageBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const gibibytes = value / 1024 ** 3
  if (gibibytes >= 1) return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(gibibytes)} GiB`
  const mebibytes = value / 1024 ** 2
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(mebibytes)} MiB`
}
const formattedStorageUsed = computed(() => formatStorageBytes(Number(entitlement.value?.storage_used || 0)))
const formattedStorageTotal = computed(() => formatStorageBytes(Number(entitlement.value?.storage_bytes || 0)))
const formattedResetAt = computed(() => {
  const raw = entitlement.value?.openrouter_resets_at
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
})
const portalAvailable = computed(() => billing.value?.portal_available === true)
const formatLimit = (limit: number) => limit > 0 ? String(limit) : t('entitlement.unlimited')

const loadEntitlement = () => entitlementStore.ensureFresh()

const openPlans = () => { void router.push('/plans') }

const handlePortal = async () => {
  if (!portalAvailable.value || portalOpening.value) return
  portalOpening.value = true
  try {
    const response = await createPaddlePortalSession()
    if (!response.authorization_url) throw new Error('Missing portal URL')
    // Paddle may change subscription state outside this tab. Mark the cached
    // snapshot stale before leaving so the focus/visibility handler fetches
    // the webhook-converged entitlement on return, even within its cooldown.
    entitlementStore.invalidate()
    window.location.assign(response.authorization_url)
  } catch {
    MessagePlugin.error(t('entitlement.portalUnavailable'))
  } finally {
    portalOpening.value = false
  }
}

onMounted(() => { void loadEntitlement() })
</script>

<style scoped lang="less">
.usage-billing { width: 100%; max-width: none; color: #111827; animation: usage-billing-fade 150ms ease-out; }
@keyframes usage-billing-fade { from { opacity: 0; } to { opacity: 1; } }
.usage-billing :deep(.visual-settings-page-header) { margin-bottom: 8px; }
.usage-billing__loading,.usage-billing__notice { color: #9ca3af; font-size: 12px; line-height: 18px; }
.usage-billing__rows { width: 100%; }
.usage-billing__row { padding: 14px 0; display: flex; align-items: center; justify-content: space-between; gap: 22px; border-bottom: 1px solid #f3f4f6; }
.usage-billing__row:last-child { border-bottom: 0; }
.usage-billing__row--meter { min-height: 64px; }
.usage-billing__row--split { min-height: 48px; }
.usage-billing__copy { min-width: 0; display: grid; gap: 2px; }
.usage-billing__copy strong { color: #111827; }
.usage-billing__plan-name { font-size: 14px; line-height: 20px; font-weight: 500; }
.usage-billing__quota-title { font-size: 12px; line-height: 16px; font-weight: 600; }
.usage-billing__copy small { color: #9ca3af; font-size: 11px; line-height: 16px; }
.usage-billing__actions { display: flex; align-items: center; gap: 12px; }
.usage-billing__meter-control { width: 224px; min-width: 0; flex: 0 0 224px; display: grid; gap: 6px; }
.usage-billing__meter-meta { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.usage-billing__meter-meta > strong { flex: 0 0 auto; color: #111827; font-family: var(--app-font-family-mono); font-size: 12px; line-height: 16px; font-weight: 700; text-align: right; white-space: nowrap; }
.usage-billing__meter-meta > strong.is-muted { color: #9da1a8; }
.usage-billing__storage-usage { color: #6b7280 !important; }
.usage-billing__meter { width: 100%; height: 6px; overflow: hidden; border-radius: 999px; background: #f3f4f6; }
.usage-billing__meter span { display: block; height: 100%; border-radius: inherit; background: #111827; transition: width 180ms ease; }
.usage-billing__row.is-compact { min-height: 42px; padding-block: 8px; flex-direction: row; align-items: center; justify-content: space-between; color: #6b7280; font-size: 12px; }
.usage-billing__row.is-compact strong { color: #111827; font-weight: 600; }
.usage-billing__secondary { flex: 0 0 auto; padding: 6px 14px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; color: #374151; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); font: inherit; font-size: 12px; line-height: 16px; font-weight: 500; cursor: pointer; }
.usage-billing__secondary:hover { border-color: #d1d5db; background: #f9fafb; }
.usage-billing__secondary:disabled { opacity: .55; cursor: wait; }
@media (max-width: 640px) {
  .usage-billing__row { align-items: flex-start; flex-direction: column; gap: 10px; }
  .usage-billing__actions { width: 100%; justify-content: space-between; }
  .usage-billing__meter-control { width: 100%; flex-basis: auto; }
}
:global(:root[theme-mode="dark"]) .usage-billing { color: #f4f4f5; }
:global(:root[theme-mode="dark"]) .usage-billing__row { border-bottom-color: #27272a; }
:global(:root[theme-mode="dark"]) .usage-billing__copy strong,
:global(:root[theme-mode="dark"]) .usage-billing__row.is-compact strong,
:global(:root[theme-mode="dark"]) .usage-billing__meter-meta > strong { color: #f4f4f5; }
:global(:root[theme-mode="dark"]) .usage-billing__meter { background: #27272a; }
:global(:root[theme-mode="dark"]) .usage-billing__meter span { background: #f4f4f5; }
:global(:root[theme-mode="dark"]) .usage-billing__secondary { border-color: #3f3f46; background: #18181b; color: #e4e4e7; }
:global(:root[theme-mode="dark"]) .usage-billing__secondary:hover { border-color: #52525b; background: #27272a; }
@media (prefers-reduced-motion: reduce) { .usage-billing { animation: none; } .usage-billing__meter span { transition: none; } }
</style>
