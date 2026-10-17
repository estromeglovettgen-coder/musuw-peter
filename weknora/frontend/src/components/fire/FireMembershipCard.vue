<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useFireMembershipStore } from '@/stores/fireMembership'
import { formatMembershipDate, formatTokens, membershipNotice, membershipStatusLabel, tokenPercent } from '@/utils/fireMembershipFormat'

withDefaults(defineProps<{ detailed?: boolean }>(), { detailed: false })
const auth = useAuthStore(), store = useFireMembershipStore()
const { membership, error, loading } = storeToRefs(store)
const { locale } = useI18n()
const tokens = (value: unknown) => formatTokens(value, locale.value)
const expires = computed(() => formatMembershipDate(membership.value?.expires_at, locale.value))
const notice = computed(() => membership.value ? membershipNotice(membership.value) : '')
watch(() => auth.currentUserId, () => { void store.refresh(false) }, { immediate: true })
</script>

<template>
  <section class="fire-membership" :class="{ 'is-detailed': detailed }" aria-label="会员套餐" :aria-busy="loading">
    <template v-if="auth.isSystemAdmin">
      <div class="fire-membership__heading"><strong>管理账户</strong><span>管理员</span></div>
      <router-link class="fire-membership__link" to="/platform/manage">会员管理 <span aria-hidden="true">→</span></router-link>
    </template>
    <template v-else-if="membership">
      <div class="fire-membership__heading"><strong>{{ membership.plan_name || '未开通会员' }}</strong><span :class="{ 'is-warning': membership.status !== 'active' }">{{ membershipStatusLabel[membership.status] || '状态未知' }}</span></div>
      <p v-if="notice" class="fire-membership__notice" role="status">{{ notice }}<span v-if="detailed">历史内容仍可查看。</span></p>
      <template v-if="membership.unlimited"><p class="fire-membership__balance">不限额度</p></template>
      <template v-else>
        <p class="fire-membership__balance"><strong>{{ tokens(membership.remaining_tokens) }}</strong><span>Token 剩余</span></p>
        <div class="fire-membership__meter" role="progressbar" aria-label="剩余 Token 比例" :aria-valuenow="tokenPercent(membership.remaining_tokens, membership.token_limit)" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${tokenPercent(membership.remaining_tokens, membership.token_limit)}%` }" /></div>
      </template>
      <p class="fire-membership__expiry">{{ expires === '—' ? '到期时间未设置' : `${expires} 到期` }}</p>
      <p v-if="Number(membership.reserved_tokens) > 0" class="fire-membership__expiry">处理中预占 {{ tokens(membership.reserved_tokens) }} Token</p>
      <p v-if="Number(membership.estimated_tokens) > 0" class="fire-membership__expiry" title="未返回原生用量时会估算；中断、掉线或重启时可能按预留上限保守结算，包含未完成调用。缓存输入不重复累加。">含估算用量 ⓘ</p>
      <div v-if="detailed" class="fire-membership__details"><span>总额度<strong>{{ tokens(membership.token_limit) }}</strong></span><span>已使用<strong>{{ tokens(membership.used_tokens) }}</strong></span><span>输入<strong>{{ tokens(membership.input_tokens) }}</strong></span><span>输出<strong>{{ tokens(membership.output_tokens) }}</strong></span></div>
      <router-link v-if="!detailed" class="fire-membership__link" to="/platform/usage">用量明细 <span aria-hidden="true">→</span></router-link>
    </template>
    <p v-else-if="loading" class="fire-membership__expiry">正在读取套餐…</p>
    <p v-else-if="!error" class="fire-membership__expiry">套餐尚未读取</p>
    <div v-if="error" class="fire-membership__error" role="status"><span>{{ membership ? '套餐更新失败，当前为上次读取结果' : '套餐读取失败' }}</span><button type="button" :disabled="loading" @click="store.refresh()">重试</button></div>
    <button v-else-if="detailed && !auth.isSystemAdmin" type="button" class="fire-membership__refresh" :disabled="loading" @click="store.refresh()">{{ loading ? '刷新中…' : '刷新用量' }}</button>
  </section>
</template>

<style scoped>
.fire-membership { margin: 0 0 10px; padding: 13px 14px; border: 1px solid var(--fire-line, #e5e7eb); border-radius: 12px; background: var(--fire-surface, #fafafa); color: var(--fire-text, #111827); font-size: 12px; text-align: left; }
.fire-membership__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.fire-membership__heading strong { font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.fire-membership__heading > span { color: var(--fire-muted, #6b7280); font-size: 10px; white-space: nowrap; }
.fire-membership__heading > .is-warning, .fire-membership__notice { color: var(--fire-link, #b7233b); }
.fire-membership__balance { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin: 12px 0 8px; font-variant-numeric: tabular-nums; }
.fire-membership__balance strong { font-size: 20px; font-weight: 600; letter-spacing: -.025em; overflow-wrap: anywhere; }
.fire-membership__balance > span, .fire-membership__expiry { color: var(--fire-muted, #6b7280); font-size: 10px; line-height: 1.6; }
.fire-membership__expiry { margin: 7px 0 0; }
.fire-membership__meter { height: 3px; background: var(--fire-line, #e5e7eb); border-radius: 4px; overflow: hidden; }
.fire-membership__meter > span { display: block; height: 100%; background: var(--fire-primary, #d62642); }
.fire-membership__link { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; color: inherit; text-decoration: none; font-size: 11px; }
.fire-membership__notice { margin: 9px 0; font-size: 11px; line-height: 1.7; }
.fire-membership__error { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; color: var(--fire-link, #b7233b); }
.fire-membership button { padding: 2px 0; border: 0; color: inherit; background: transparent; text-decoration: underline; font: inherit; cursor: pointer; }
.fire-membership button:disabled { opacity: .5; cursor: wait; }
.fire-membership__details { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; border-top: 1px solid var(--fire-line, #e5e7eb); padding: 20px 0; margin-top: 20px; }
.fire-membership__details > span { display: grid; gap: 8px; color: var(--fire-muted, #6b7280); }
.fire-membership__details strong { color: var(--fire-text, #111827); font-size: 18px; overflow-wrap: anywhere; }
.fire-membership.is-detailed { padding: 24px; }
.fire-membership.is-detailed .fire-membership__heading strong { font-size: 18px; }
.fire-membership.is-detailed .fire-membership__balance strong { font-size: 32px; }
.fire-membership.is-detailed .fire-membership__expiry { font-size: 12px; }
@media (max-width: 640px) { .fire-membership__details { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
