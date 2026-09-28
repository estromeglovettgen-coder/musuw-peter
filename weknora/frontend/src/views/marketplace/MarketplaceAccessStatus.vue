<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ canUse: boolean; status: string; paidThrough?: string; cancelAtPeriodEnd?: boolean }>()
const { t, locale } = useI18n()
const date = computed(() => {
  if (!props.paidThrough) return ''
  const value = new Date(props.paidThrough)
  return Number.isNaN(value.getTime()) ? '' : new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(value)
})
const label = computed(() => {
  if (props.canUse) {
    if (date.value) return t(props.cancelAtPeriodEnd ? 'creatorMarketplace.cancelScheduled' : 'creatorMarketplace.availableUntil', { date: date.value })
    return t('creatorMarketplace.status.active')
  }
  const termExpired = props.paidThrough && new Date(props.paidThrough).getTime() <= Date.now()
  const displayStatus = termExpired && ['active', 'trialing', 'canceled', 'cancelled'].includes(props.status) ? 'expired' : props.status
  const knownStatus = ['past_due', 'refunded', 'expired', 'canceled', 'cancelled', 'paused', 'chargeback', 'disputed', 'pending_payment'].includes(displayStatus)
  const status = t(knownStatus ? `creatorMarketplace.status.${displayStatus}` : 'creatorMarketplace.libraryUnavailable')
  return date.value ? `${status} · ${t('creatorMarketplace.paidThrough')} ${date.value}` : status
})
</script>

<template>
  <span class="market-access-status" :class="{ 'is-unavailable': !canUse }"><t-icon :name="canUse ? 'calendar' : 'info-circle'" /><span>{{ label }}</span></span>
</template>

<style scoped>
.market-access-status { display: inline-flex; align-items: center; gap: 6px; min-width: 0; min-height: 24px; color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.market-access-status > :first-child { flex-shrink: 0; }
.market-access-status.is-unavailable { color: var(--td-text-color-primary); }
</style>
