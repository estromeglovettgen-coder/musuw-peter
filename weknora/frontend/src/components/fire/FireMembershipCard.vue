<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useFireMembershipStore } from '@/stores/fireMembership'
import { formatMembershipDate, membershipNotice, membershipStatusLabel, tokenPercent, remainingUsageLabel } from '@/utils/fireMembershipFormat'
const auth=useAuthStore(),store=useFireMembershipStore()
const {membership,error,loading}=storeToRefs(store)
const {locale}=useI18n()
const expires=computed(()=>formatMembershipDate(membership.value?.expires_at,locale.value))
const notice=computed(()=>membership.value?membershipNotice(membership.value):'')
const remaining=computed(()=>membership.value?remainingUsageLabel(membership.value.remaining_tokens,membership.value.token_limit,locale.value):'—')
watch(()=>auth.currentUserId,()=>{void store.refresh(false)},{immediate:true})
</script>
<template>
 <section class="fire-membership" aria-label="会员套餐" :aria-busy="loading">
  <template v-if="membership">
   <div class="fire-membership__heading"><strong>{{ membership.plan_name||'未开通会员' }}</strong><span :class="{'is-warning':membership.status!=='active'}">{{ membershipStatusLabel[membership.status]||'状态未知' }}</span></div>
   <p v-if="notice" class="fire-membership__notice" role="status">{{ notice }}</p>
   <p class="fire-membership__balance"><span>剩余额度</span><strong>{{ membership.unlimited?'不限额度':remaining }}</strong></p>
   <div v-if="!membership.unlimited && remaining!=='—'" class="fire-membership__meter" role="progressbar" aria-label="剩余额度比例" :aria-valuenow="tokenPercent(membership.remaining_tokens,membership.token_limit)" aria-valuemin="0" aria-valuemax="100"><span :style="{width:`${tokenPercent(membership.remaining_tokens,membership.token_limit)}%`}" /></div>
   <p class="fire-membership__expiry">{{ expires==='—'?'到期时间未设置':`${expires} 到期` }}</p>
   <p v-if="Number(membership.reserved_tokens)>0" class="fire-membership__expiry">用量更新中…</p>
   <p v-if="Number(membership.estimated_tokens)>0" class="fire-membership__expiry" title="部分调用未返回完整统计，用量包含估算。">含估算用量 ⓘ</p>
  </template>
  <p v-else-if="loading" class="fire-membership__expiry">正在读取套餐…</p>
  <div v-if="error" class="fire-membership__error" role="status"><span>{{ membership?'套餐更新失败，当前为上次读取结果':'套餐读取失败' }}</span><button type="button" :disabled="loading" @click="store.refresh()">重试</button></div>
 </section>
</template>
<style scoped>
.fire-membership { margin: 0; padding: 12px; border: 0; border-radius: 10px; background: var(--fire-surface, #fafafa); color: var(--fire-text, #111827); font-size: 12px; text-align: left; }
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
</style>
