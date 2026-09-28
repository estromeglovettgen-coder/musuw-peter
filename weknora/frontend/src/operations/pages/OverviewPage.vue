<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div>
        <h1>概览</h1>
        <p>跨用户、空间、知识库和官方服务的实时运营视图。所有数字来自当前 {{ config?.environment || '环境' }}，不展示模板示例数据。</p>
      </div>
      <div class="ops-page-actions">
        <t-tag :theme="config?.target === 'production' ? 'danger' : 'primary'" variant="light-outline">
          {{ config?.environment || '连接中' }} 数据
        </t-tag>
      </div>
    </header>

    <div v-if="loading && !data" class="ops-panel ops-loading"><t-loading size="medium" text="加载真实运营数据" /></div>
    <div v-else-if="error && !data" class="ops-panel ops-error">
      <t-alert theme="error" title="概览加载失败" :message="error">
        <template #operation><t-button size="small" @click="load">重试</t-button></template>
      </t-alert>
    </div>
    <template v-else-if="data">
      <section class="ops-metrics">
        <article class="ops-metric">
          <div class="ops-metric__top">
            <span class="ops-metric__label">用户</span>
            <span class="ops-metric__icon"><UsergroupIcon size="18" /></span>
          </div>
          <div class="ops-metric__value">{{ formatNumber(data.users.total) }}</div>
          <div class="ops-metric__hint">{{ formatNumber(data.users.active) }} 活跃 · 近 30 天新增 {{ formatNumber(data.users.new_30d) }}</div>
        </article>
        <article class="ops-metric">
          <div class="ops-metric__top">
            <span class="ops-metric__label">工作空间</span>
            <span class="ops-metric__icon"><LayersIcon size="18" /></span>
          </div>
          <div class="ops-metric__value">{{ formatNumber(data.tenants.total) }}</div>
          <div class="ops-metric__hint">{{ formatNumber(data.tenants.active) }} 启用 · {{ formatNumber(data.tenants.paid) }} 付费</div>
        </article>
        <article class="ops-metric">
          <div class="ops-metric__top">
            <span class="ops-metric__label">知识库 / 文档</span>
            <span class="ops-metric__icon"><FileIcon size="18" /></span>
          </div>
          <div class="ops-metric__value">{{ formatNumber(data.knowledge.knowledge_bases) }} <small>/ {{ formatNumber(data.knowledge.documents) }}</small></div>
          <div class="ops-metric__hint">{{ formatNumber(data.knowledge.processing) }} 处理中 · {{ formatNumber(data.knowledge.failed) }} 失败</div>
        </article>
        <article class="ops-metric">
          <div class="ops-metric__top">
            <span class="ops-metric__label">空间计量 / 配额</span>
            <span class="ops-metric__icon"><CloudIcon size="18" /></span>
          </div>
          <div class="ops-metric__value">{{ formatBytes(data.tenants.storage_used_bytes) }}</div>
          <div class="ops-metric__hint">总配额 {{ formatBytes(data.tenants.storage_quota_bytes) }} · {{ storagePercent.toFixed(1) }}%</div>
        </article>
      </section>

      <section class="ops-grid ops-grid--2">
        <article class="ops-panel">
          <header class="ops-panel__header">
            <div class="ops-panel__title">
              <h2>最近更新的文档</h2>
              <p>解析状态来自 Musuw，不把 provider 错误伪装为空结果</p>
            </div>
            <t-button variant="text" size="small" @click="goTo('knowledge')">查看全部 <ChevronRightIcon /></t-button>
          </header>
          <div v-if="data.recent_documents.length" class="ops-panel__body ops-panel__body--flush">
            <t-table row-key="id" :data="data.recent_documents" :columns="recentColumns" size="small" :hover="true">
              <template #document="{ row }">
                <div class="ops-cell-primary">
                  <strong>{{ row.title || '未命名文档' }}</strong>
                  <span>{{ row.knowledge_base_name }} · {{ row.file_type || 'unknown' }}</span>
                </div>
              </template>
              <template #tenant="{ row }"><span>{{ row.tenant_name || '—' }}</span></template>
              <template #status="{ row }">
                <span class="ops-status" :class="`is-${statusTone(row.parse_status)}`">{{ row.parse_status || 'unknown' }}</span>
              </template>
              <template #updated="{ row }"><span class="ops-muted">{{ formatDate(row.updated_at) }}</span></template>
            </t-table>
          </div>
          <div v-else class="ops-empty">
            <div><span class="ops-empty__icon"><FileIcon size="20" /></span><h3>暂无文档</h3><p>这是当前环境的真实空状态，不是加载占位。</p></div>
          </div>
        </article>

        <article class="ops-panel">
          <header class="ops-panel__header">
            <div class="ops-panel__title"><h2>官方服务</h2><p>能力状态和权威入口</p></div>
          </header>
          <div class="ops-panel__body">
            <div class="ops-provider-list">
              <div v-for="provider in providers" :key="provider.key" class="ops-provider">
                <span class="ops-provider__icon"><component :is="provider.icon" size="17" /></span>
                <div class="ops-provider__body">
                  <strong>{{ provider.name }}</strong>
                  <span :title="provider.reason || provider.authority">{{ provider.reason || provider.authority }}</span>
                </div>
                <a v-if="provider.url" :href="provider.url" target="_blank" rel="noopener noreferrer" class="ops-provider__state" :class="{ 'is-ready': provider.available }">
                  {{ provider.available ? '已连接' : '打开官方后台' }}
                </a>
                <span v-else class="ops-provider__state" :class="{ 'is-ready': provider.available }">{{ provider.available ? '已连接' : '不可用' }}</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="ops-grid ops-grid--equal">
        <article class="ops-panel">
          <header class="ops-panel__header"><div class="ops-panel__title"><h2>存储口径</h2><p>原文件、索引计量和租户配额分开显示</p></div></header>
          <div class="ops-panel__body">
            <dl class="ops-definition">
              <div><dt>原文件总量</dt><dd>{{ formatBytes(data.knowledge.source_bytes) }}</dd></div>
              <div><dt>索引计量</dt><dd>{{ formatBytes(data.knowledge.index_bytes) }}</dd></div>
              <div><dt>tenant.storage_used</dt><dd>{{ formatBytes(data.tenants.storage_used_bytes) }}</dd></div>
              <div><dt>总配额</dt><dd>{{ formatBytes(data.tenants.storage_quota_bytes) }}</dd></div>
            </dl>
            <div style="margin-top:16px" class="ops-progress" :class="storagePercent > 90 ? 'is-danger' : storagePercent > 70 ? 'is-warning' : ''"><span :style="{ width: `${storagePercent}%` }" /></div>
          </div>
        </article>
        <article class="ops-panel">
          <header class="ops-panel__header"><div class="ops-panel__title"><h2>存储后端</h2><p>仅展示配置元数据，不返回凭据</p></div></header>
          <div class="ops-panel__body">
            <div v-if="data.storage_backends.length" class="ops-provider-list">
              <div v-for="backend in data.storage_backends" :key="`${backend.provider}-${backend.source}-${backend.status}`" class="ops-provider">
                <span class="ops-provider__icon"><ServerIcon size="17" /></span>
                <div class="ops-provider__body"><strong>{{ backend.provider }}</strong><span>{{ backend.source }} · {{ backend.count }} 个空间配置</span></div>
                <span class="ops-status" :class="`is-${statusTone(backend.status)}`">{{ backend.status }}</span>
              </div>
            </div>
            <div v-else class="ops-callout is-warning"><InfoCircleIcon class="ops-callout__icon" /><div><strong>没有活动存储后端</strong><span>请在 Musuw 运行时检查存储注册，而不是在页面里伪造 R2 状态。</span></div></div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { ChevronRightIcon, CloudIcon, FileIcon, InfoCircleIcon, LayersIcon, LinkIcon, MoneyIcon, ServerIcon, UserSafetyIcon, UsergroupIcon } from 'tdesign-icons-vue-next'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import { formatBytes, formatDate, formatNumber, percent, statusTone } from '../format'
import type { OperationsConfig, OverviewData } from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const data = ref<OverviewData | null>(null)
const loading = ref(false)
const error = ref('')

const recentColumns = [
  { colKey: 'document', title: '文档', minWidth: 240 },
  { colKey: 'tenant', title: '工作空间', width: 150 },
  { colKey: 'status', title: '解析状态', width: 110 },
  { colKey: 'updated', title: '更新时间', width: 160 },
]

const providerMetadata = {
  weknora: { name: 'Musuw', icon: markRaw(ServerIcon), url: '' },
  paddle: { name: 'Paddle', icon: markRaw(MoneyIcon), urlKey: 'paddle' },
  supabase: { name: 'Supabase Auth', icon: markRaw(UserSafetyIcon), urlKey: 'supabase_staging' },
  r2: { name: 'Cloudflare R2', icon: markRaw(CloudIcon), urlKey: 'cloudflare_r2' },
  langfuse: { name: 'Langfuse', icon: markRaw(LinkIcon), urlKey: 'langfuse' },
} as const

const providers = computed(() => Object.entries(providerMetadata).map(([key, meta]) => {
  const state = props.config?.providers[key as keyof OperationsConfig['providers']]
  const url = 'urlKey' in meta ? props.config?.links[meta.urlKey] : meta.url
  return { key, ...meta, url, available: state?.available || false, authority: state?.authority || '', reason: state?.reason || '' }
}))

const storagePercent = computed(() => percent(data.value?.tenants.storage_used_bytes, data.value?.tenants.storage_quota_bytes))

function goTo(page: string) { window.location.hash = `/${page}` }

async function load() {
  loading.value = true
  error.value = ''
  emit('busy', true)
  try { data.value = await operationsApi.overview() }
  catch (loadError) { error.value = loadError instanceof Error ? loadError.message : '加载失败' }
  finally { loading.value = false; emit('busy', false) }
}

useOperationsReadRecovery(error, loading, load)
onMounted(load)
watch(() => props.refreshKey, load)
</script>

<style scoped>
.ops-metric__value small { color: #596579; font-size: 16px; font-weight: 600; }
a.ops-provider__state { text-decoration: none; }
a.ops-provider__state:hover { text-decoration: underline; }
</style>
