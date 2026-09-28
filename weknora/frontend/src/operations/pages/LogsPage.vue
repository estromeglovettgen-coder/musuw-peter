<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div><h1>日志与追踪</h1><p>复用 Musuw 原生运行队列与系统审计，并通过 Langfuse 官方 API 展示不含 prompt、content 和 output 的安全追踪元数据。</p></div>
      <div class="ops-page-actions"><t-tag :theme="config?.providers.langfuse.available ? 'success' : 'warning'" variant="light-outline">Langfuse {{ config?.providers.langfuse.available ? 'available' : 'unavailable' }}</t-tag></div>
    </header>

    <div v-if="!config?.providers.langfuse.available" class="ops-callout is-warning" style="margin-bottom:14px"><InfoCircleIcon class="ops-callout__icon"/><div><strong>Langfuse 查询不可用</strong><span>{{ config?.providers.langfuse.reason }}。运行队列、处理 span、request ID 和系统审计仍可从 Musuw 查看。</span></div></div>

    <div class="ops-segmented" style="margin-bottom:14px"><button :class="{ 'is-active': tab === 'runtime' }" @click="tab = 'runtime'">运行队列</button><button :class="{ 'is-active': tab === 'audit' }" @click="tab = 'audit'">系统审计</button><button :class="{ 'is-active': tab === 'langfuse' }" @click="tab = 'langfuse'">Langfuse 追踪</button></div>
    <section v-if="tab !== 'langfuse'" class="ops-panel logs-host"><RuntimeQueues v-if="tab === 'runtime'" :key="`runtime-${refreshKey}`" /><SystemAuditLog v-else :key="`audit-${refreshKey}`" /></section>
    <section v-else class="ops-panel langfuse-host">
      <header class="ops-panel__header"><div class="ops-panel__title"><h2>Langfuse 官方 Observations</h2><p>最近 30 天 · 最多 100 条 · 明确排除输入、输出和附件</p></div><a v-if="config?.links.langfuse" :href="config.links.langfuse" target="_blank" rel="noopener noreferrer"><t-button variant="outline" size="small">打开 Langfuse <LinkIcon /></t-button></a></header>
      <div v-if="langfuseLoading && !langfuse" class="ops-loading"><t-loading text="加载官方追踪" /></div>
      <div v-else-if="langfuseError && !langfuse" class="ops-error"><t-alert theme="error" title="Langfuse 加载失败" :message="langfuseError"><template #operation><t-button size="small" @click="loadLangfuse">重试</t-button></template></t-alert></div>
      <div v-else-if="langfuse?.available" class="ops-panel__body ops-panel__body--flush">
        <t-table v-if="langfuse.observations.length" row-key="id" :data="langfuse.observations" :columns="langfuseColumns" hover>
          <template #observation="{ row }"><div class="ops-cell-primary"><strong>{{ row.name || row.type || '未命名 observation' }}</strong><span class="ops-mono">{{ row.id }}</span></div></template>
          <template #trace="{ row }"><div class="ops-cell-primary"><strong>{{ row.trace_name || '—' }}</strong><span class="ops-mono">{{ row.trace_id }}</span></div></template>
          <template #model="{ row }"><span class="ops-status is-primary">{{ row.model || '—' }}</span></template>
          <template #usage="{ row }"><div class="ops-cell-primary"><strong>{{ formatUsage(row.total_usage) }}</strong><span>{{ formatCost(row.total_cost) }}</span></div></template>
          <template #environment="{ row }"><div class="ops-cell-primary"><strong>{{ row.environment || '—' }}</strong><span>{{ row.release || '—' }}</span></div></template>
          <template #started="{ row }"><span class="ops-muted">{{ formatDate(row.start_time) }}</span></template>
        </t-table>
        <div v-else class="ops-empty"><div><span class="ops-empty__icon"><ChartBubbleIcon /></span><h3>最近 30 天没有 observation</h3><p>这是 Langfuse 官方 API 的真实空状态。</p></div></div>
      </div>
      <div v-else class="ops-panel__body"><div class="ops-callout is-warning"><InfoCircleIcon class="ops-callout__icon"/><div><strong>Langfuse unavailable</strong><span>{{ langfuse?.reason || config?.providers.langfuse.reason }}</span></div></div></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ChartBubbleIcon, InfoCircleIcon, LinkIcon } from 'tdesign-icons-vue-next'
import RuntimeQueues from '@/views/system/RuntimeQueues.vue'
import SystemAuditLog from '@/views/system/SystemAuditLog.vue'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import { formatDate, formatNumber } from '../format'
import type { LangfuseData, OperationsConfig } from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const tab = ref<'runtime'|'audit'|'langfuse'>('runtime')
const langfuse = ref<LangfuseData | null>(null), langfuseLoading = ref(false), langfuseError = ref('')
const langfuseColumns = [
  { colKey: 'observation', title: 'Observation', minWidth: 230 }, { colKey: 'trace', title: 'Trace', minWidth: 220 },
  { colKey: 'type', title: '类型', width: 110 }, { colKey: 'model', title: '模型', width: 170 },
  { colKey: 'usage', title: '用量 / 成本', width: 130 }, { colKey: 'environment', title: '环境 / Release', minWidth: 170 }, { colKey: 'started', title: '开始时间', width: 170 },
]
function formatUsage(value: unknown) { return value == null ? '—' : formatNumber(value) }
function formatCost(value: unknown) { return value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(Number(value)) }
async function loadLangfuse() { langfuseLoading.value = true; langfuseError.value = ''; emit('busy', true); try { langfuse.value = await operationsApi.langfuse() } catch (e) { langfuseError.value = e instanceof Error ? e.message : '加载失败' } finally { langfuseLoading.value = false; emit('busy', false) } }
useOperationsReadRecovery(langfuseError, langfuseLoading, loadLangfuse)
onMounted(loadLangfuse)
watch(() => props.refreshKey, loadLangfuse)
</script>

<style scoped>
.logs-host { min-height: 560px; overflow: hidden; padding: 18px; }
.logs-host :deep(.runtime-queues), .logs-host :deep(.system-audit-log) { min-height: 520px; }
.logs-host :deep(.section-header) { margin-top: 0; }
.langfuse-host { min-height: 560px; overflow: hidden; }
.langfuse-host a { text-decoration: none; }
</style>
