<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FireUsage } from '@/api/fire-membership'
import { formatMembershipDate, formatTokens } from '@/utils/fireMembershipFormat'
defineProps<{ items: FireUsage[] }>()
const { locale } = useI18n()
const purpose = (value: string) => ({ chat: '对话', agent: '智能体', agent_chat: '智能体对话', wiki: 'Wiki', parsing: '文件解析', summary: '摘要' })[value] || value || '模型调用'
</script>
<template>
  <div class="fire-usage-table">
    <table v-if="items.length"><thead><tr><th>时间</th><th>用途</th><th>输入 Token</th><th>输出 Token</th><th>总 Token</th><th>计量</th></tr></thead><tbody><tr v-for="(item, index) in items" :key="item.id || `${item.created_at}-${index}`"><td>{{ formatMembershipDate(item.created_at, locale) }}</td><td>{{ purpose(item.purpose) }}</td><td>{{ formatTokens(item.input_tokens, locale) }}</td><td>{{ formatTokens(item.output_tokens, locale) }}</td><td>{{ formatTokens(item.total_tokens, locale) }}</td><td><span v-if="item.estimated || Number(item.estimated_tokens) > 0" title="未返回原生用量时会估算；中断、掉线或重启时可能按预留上限保守结算，包含未完成调用。">估算 ⓘ</span><span v-else>实际</span></td></tr></tbody></table>
    <p v-else class="fire-usage-table__empty">暂无用量记录</p>
  </div>
</template>
<style scoped>
.fire-usage-table { overflow-x: auto; border: 1px solid var(--fire-line, #e5e7eb); border-radius: 12px; background: var(--fire-surface, #fff); }
table { border-collapse: collapse; width: 100%; min-width: 640px; text-align: left; font-size: 12px; font-variant-numeric: tabular-nums; } th, td { padding: 15px 18px; border-bottom: 1px solid var(--fire-line, #e5e7eb); white-space: nowrap; } th { color: var(--fire-muted, #6b7280); font-size: 11px; font-weight: 500; } tbody tr:last-child td { border: 0; } .fire-usage-table__empty { margin: 0; padding: 35px; text-align: center; color: var(--fire-muted, #6b7280); font-size: 13px; }
</style>
