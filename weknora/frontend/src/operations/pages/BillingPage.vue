<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div><h1>账单</h1><p>Paddle 是订阅和交易权威；Musuw 只展示签名 webhook 形成的空间镜像与官方 API 读取结果，不维护第二套账本。</p></div>
      <div class="ops-page-actions"><a :href="config?.links.paddle" target="_blank" rel="noopener noreferrer"><t-button theme="primary">打开 Paddle {{ config?.target === 'production' ? 'Live' : 'Sandbox' }} <LinkIcon /></t-button></a></div>
    </header>

    <div v-if="loading && !data" class="ops-panel ops-loading"><t-loading text="从 Paddle 与 Musuw 读取账单" /></div>
    <div v-else-if="error && !data" class="ops-panel ops-error"><t-alert theme="error" title="账单加载失败" :message="error"><template #operation><t-button size="small" @click="load">重试</t-button></template></t-alert></div>
    <template v-else-if="data">
      <section class="ops-metrics">
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">空间镜像</span><span class="ops-metric__icon"><LayersIcon /></span></div><div class="ops-metric__value">{{ data.mirror.length }}</div><div class="ops-metric__hint">所有套餐空间，含 Free</div></article>
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">付费订阅绑定</span><span class="ops-metric__icon"><MoneyIcon /></span></div><div class="ops-metric__value">{{ boundSubscriptions }}</div><div class="ops-metric__hint">有 Paddle subscription_id</div></article>
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">Paddle 订阅</span><span class="ops-metric__icon"><WalletIcon /></span></div><div class="ops-metric__value">{{ data.provider.subscriptions_available ? data.provider.subscriptions.length : '—' }}</div><div class="ops-metric__hint">{{ data.provider.subscriptions_available ? '官方 API 当前页' : '官方读取权限不可用' }}</div></article>
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">Paddle 交易</span><span class="ops-metric__icon"><BillIcon /></span></div><div class="ops-metric__value">{{ data.provider.transactions_available ? data.provider.transactions.length : '—' }}</div><div class="ops-metric__hint">{{ data.provider.transactions_available ? '官方 API 当前页' : '官方读取权限不可用' }}</div></article>
      </section>

      <div v-if="!allProviderCapabilitiesAvailable" class="ops-callout is-warning" style="margin-top:14px"><InfoCircleIcon class="ops-callout__icon"/><div><strong>{{ data.provider.available ? 'Paddle 官方 API 权限有限' : 'Paddle 官方 API 不可用' }}</strong><span>{{ data.provider.reason }}。已获授权的能力继续展示真实数据；未授权能力不会被伪装成 0 条记录。</span></div></div>

      <section class="ops-panel" style="margin-top:14px">
        <header class="ops-panel__header"><div class="ops-panel__title"><h2>Musuw 订阅镜像</h2><p>只由 Paddle 签名事件更新；点击查看完整标识</p></div></header>
        <div class="ops-panel__body ops-panel__body--flush">
          <t-table v-if="data.mirror.length" row-key="tenant_id" :data="data.mirror" :columns="mirrorColumns" hover @row-click="handleMirrorClick">
            <template #tenant="{ row }"><div class="ops-cell-primary"><strong>{{ row.tenant_name }}</strong><span class="ops-mono">#{{ row.tenant_id }}</span></div></template>
            <template #plan="{ row }"><t-tag size="small" :theme="statusTone(row.plan)" variant="light-outline">{{ String(row.plan || 'free').toUpperCase() }}</t-tag></template>
            <template #status="{ row }"><span class="ops-status" :class="`is-${statusTone(row.plan_status)}`">{{ row.plan_status || 'unknown' }}</span></template>
            <template #subscription="{ row }"><div class="ops-cell-primary"><strong class="ops-mono">{{ row.paddle_subscription_id || '未绑定' }}</strong><span class="ops-mono">{{ row.paddle_customer_id || '—' }}</span></div></template>
            <template #period="{ row }"><div class="ops-cell-primary"><strong>{{ row.paddle_billing_period || '—' }}</strong><span>{{ formatDate(row.paddle_current_period_end) }}</span></div></template>
            <template #event="{ row }"><div class="ops-cell-primary"><strong class="ops-mono">{{ row.paddle_last_event_id || '—' }}</strong><span>{{ formatDate(row.paddle_last_event_at) }}</span></div></template>
          </t-table>
          <div v-else class="ops-empty"><div><span class="ops-empty__icon"><BillIcon /></span><h3>当前环境没有空间</h3><p>这是数据库真实空状态，不代表 Paddle 返回空数据。</p></div></div>
        </div>
      </section>

      <section class="ops-panel" style="margin-top:14px">
        <header class="ops-panel__header"><div class="ops-panel__title"><h2>Paddle 官方数据</h2><p>服务端最小权限凭据读取，浏览器不接触密钥</p></div><div class="ops-segmented"><button :class="{ 'is-active': providerTab === 'subscriptions' }" @click="providerTab = 'subscriptions'">订阅</button><button :class="{ 'is-active': providerTab === 'transactions' }" @click="providerTab = 'transactions'">交易</button></div></header>
        <div class="ops-panel__body ops-panel__body--flush">
          <t-table v-if="providerRows.length" row-key="id" :data="providerRows" :columns="providerColumns" hover @row-click="handleProviderClick">
            <template #id="{ row }"><span class="ops-mono">{{ row.id }}</span></template><template #status="{ row }"><span class="ops-status" :class="`is-${statusTone(row.status)}`">{{ row.status }}</span></template>
            <template #customer="{ row }"><span class="ops-mono">{{ row.customer_id || '—' }}</span></template><template #created="{ row }"><span class="ops-muted">{{ formatDate(row.created_at) }}</span></template>
          </t-table>
          <div v-else class="ops-empty"><div><span class="ops-empty__icon"><WalletIcon /></span><h3>{{ activeProviderCapability.available ? `没有${providerTab === 'subscriptions' ? '订阅' : '交易'}记录` : `Paddle ${providerTab === 'subscriptions' ? '订阅' : '交易'} API unavailable` }}</h3><p>{{ activeProviderCapability.available ? '当前 Paddle 环境返回 0 条真实记录。' : activeProviderCapability.reason }}</p></div></div>
        </div>
      </section>
    </template>

    <t-drawer v-model:visible="drawerVisible" :footer="false" size="680px"><template #header><div class="ops-drawer-header"><h2>账单记录详情</h2><p>完整 provider / mirror 字段</p></div></template><pre v-if="drawerData" class="ops-json">{{ JSON.stringify(drawerData, null, 2) }}</pre></t-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BillIcon, InfoCircleIcon, LayersIcon, LinkIcon, MoneyIcon, WalletIcon } from 'tdesign-icons-vue-next'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import { formatDate, statusTone } from '../format'
import type { BillingData, OperationsConfig, TenantBillingRow } from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const data = ref<BillingData | null>(null), loading = ref(false), error = ref(''), providerTab = ref<'subscriptions'|'transactions'>('subscriptions')
const drawerVisible = ref(false), drawerData = ref<unknown>(null)
const boundSubscriptions = computed(() => data.value?.mirror.filter((row) => row.paddle_subscription_id).length || 0)
const providerRows = computed(() => data.value?.provider[providerTab.value] || [])
const allProviderCapabilitiesAvailable = computed(() => Boolean(data.value?.provider.subscriptions_available && data.value?.provider.transactions_available))
const activeProviderCapability = computed(() => providerTab.value === 'subscriptions'
  ? { available: Boolean(data.value?.provider.subscriptions_available), reason: data.value?.provider.subscriptions_reason || '' }
  : { available: Boolean(data.value?.provider.transactions_available), reason: data.value?.provider.transactions_reason || '' })
const mirrorColumns = [
  { colKey: 'tenant', title: '空间', minWidth: 190 }, { colKey: 'plan', title: '套餐', width: 90 }, { colKey: 'status', title: '状态', width: 110 },
  { colKey: 'subscription', title: 'Subscription / Customer', minWidth: 220 }, { colKey: 'period', title: '账期 / 到期', width: 170 }, { colKey: 'event', title: '最后签名事件', minWidth: 190 },
]
const providerColumns = [
  { colKey: 'id', title: 'ID', minWidth: 210 }, { colKey: 'status', title: '状态', width: 110 }, { colKey: 'customer', title: 'Customer', minWidth: 190 },
  { colKey: 'currency_code', title: '币种', width: 80 }, { colKey: 'created', title: '创建时间', width: 170 },
]
async function load() { loading.value = true; error.value = ''; emit('busy', true); try { data.value = await operationsApi.billing() } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false; emit('busy', false) } }
function openMirror(row: TenantBillingRow) { drawerData.value = row; drawerVisible.value = true }
function openProvider(row: unknown) { drawerData.value = row; drawerVisible.value = true }
function handleMirrorClick(context: { row: TenantBillingRow }) { openMirror(context.row) }
function handleProviderClick(context: { row: Record<string, unknown> }) { openProvider(context.row) }
useOperationsReadRecovery(error, loading, load)
onMounted(load); watch(() => props.refreshKey, load)
</script>

<style scoped>
.ops-page-actions a { text-decoration: none; }
</style>
