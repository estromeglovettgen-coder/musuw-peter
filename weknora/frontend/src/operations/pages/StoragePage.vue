<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div><h1>存储</h1><p>分别呈现原文件 file_size、索引 storage_size、tenant.storage_used、配额和物理对象引用，不再把小数值四舍五入成“0 存储”。</p></div>
      <div class="ops-page-actions">
        <t-tag :theme="config?.providers.r2.available ? 'success' : (config?.providers.r2.applicable === false ? 'default' : 'warning')" variant="light-outline">{{ config?.providers.r2.applicable === false ? 'TEST 本地存储' : `R2 operator ${config?.providers.r2.available ? 'available' : 'unavailable'}` }}</t-tag>
        <a :href="config?.links.cloudflare_r2" target="_blank" rel="noopener noreferrer"><t-button theme="primary">打开 Cloudflare R2 <LinkIcon /></t-button></a>
      </div>
    </header>

    <div v-if="loading && !data" class="ops-panel ops-loading"><t-loading text="加载存储清单" /></div>
    <div v-else-if="error && !data" class="ops-panel ops-error"><t-alert theme="error" title="存储加载失败" :message="error"><template #operation><t-button size="small" @click="load">重试</t-button></template></t-alert></div>
    <template v-else-if="data">
      <section class="ops-metrics">
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">原文件 file_size</span><span class="ops-metric__icon"><FileIcon /></span></div><div class="ops-metric__value">{{ formatBytes(data.usage.source_bytes) }}</div><div class="ops-metric__hint">用户上传源文件总量</div></article>
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">索引 storage_size</span><span class="ops-metric__icon"><ChartBubbleIcon /></span></div><div class="ops-metric__value">{{ formatBytes(data.usage.index_bytes) }}</div><div class="ops-metric__hint">解析与索引计量</div></article>
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">tenant.storage_used</span><span class="ops-metric__icon"><DataBaseIcon /></span></div><div class="ops-metric__value">{{ formatBytes(data.usage.measured_used_bytes) }}</div><div class="ops-metric__hint">产品额度执行口径</div></article>
        <article class="ops-metric"><div class="ops-metric__top"><span class="ops-metric__label">租户总配额</span><span class="ops-metric__icon"><CloudIcon /></span></div><div class="ops-metric__value">{{ formatBytes(data.usage.quota_bytes) }}</div><div class="ops-metric__hint">当前套餐配额合计</div></article>
      </section>

      <div class="ops-callout" :class="data.provider.available || data.provider.applicable === false ? '' : 'is-warning'" style="margin-top:14px">
        <component :is="data.provider.available ? CheckCircleIcon : InfoCircleIcon" class="ops-callout__icon" />
        <div><strong>{{ data.provider.applicable === false ? 'TEST 使用本地存储' : `Cloudflare R2 官方对象查询 ${data.provider.available ? '已连接' : 'unavailable'}` }}</strong><span>{{ data.provider.available ? `已通过官方 S3 API 核对 ${data.provider.bucket}/${data.provider.prefix || ''}，浏览器不接触凭据。` : data.provider.applicable === false ? '当前 TEST 运行时不使用 Cloudflare R2，因此不要求也不伪造 R2 凭据或对象清单。' : `${data.provider.reason}。下方 Musuw 存储绑定不会被包装成 R2 LIST/HEAD 成功。` }}</span></div>
      </div>

      <section v-if="data.provider.available" class="ops-panel" style="margin-top:14px">
        <header class="ops-panel__header"><div class="ops-panel__title"><h2>Cloudflare R2 官方清单</h2><p>{{ data.provider.bucket }} / {{ data.provider.prefix || '桶根目录' }} · 最多展示前 1,000 个对象</p></div><t-tag theme="success" variant="light-outline">S3 API CONNECTED</t-tag></header>
        <div class="ops-panel__body">
          <dl class="ops-definition r2-summary">
            <div><dt>官方对象数</dt><dd>{{ data.provider.total }}</dd></div><div><dt>当前清单大小</dt><dd>{{ formatBytes(data.provider.total_bytes) }}</dd></div>
            <div><dt>Bucket</dt><dd class="ops-mono">{{ data.provider.bucket }}</dd></div><div><dt>Prefix</dt><dd class="ops-mono">{{ data.provider.prefix || '—' }}</dd></div>
          </dl>
          <t-table v-if="data.provider.objects.length" v-accessible-scroll="'Cloudflare R2 对象清单'" class="r2-objects" row-key="key" :data="data.provider.objects" :columns="r2Columns" size="small" hover>
            <template #key="{ row }"><span class="ops-mono r2-object-key" :title="row.key">{{ row.key }}</span></template>
            <template #size="{ row }"><strong>{{ formatBytes(row.size) }}</strong></template>
            <template #last_modified="{ row }"><span class="ops-muted">{{ formatDate(row.last_modified) }}</span></template>
          </t-table>
          <div v-else class="ops-empty"><div><span class="ops-empty__icon"><CloudIcon /></span><h3>R2 当前返回 0 个对象</h3><p>这是官方 LIST API 的真实空状态。</p></div></div>
        </div>
      </section>

      <section class="ops-panel" style="margin-top:14px">
        <header class="ops-panel__header"><div class="ops-panel__title"><h2>Musuw 存储后端</h2><p>配置字段和凭据不返回浏览器</p></div></header>
        <div class="ops-panel__body">
          <div v-if="data.backends.length" class="storage-backends">
            <div v-for="backend in data.backends" :key="backend.id" class="storage-backend">
              <span class="storage-backend__icon"><component :is="backend.provider === 's3' ? CloudIcon : ServerIcon" /></span>
              <div class="storage-backend__body"><strong>{{ backend.name }}</strong><span>{{ backend.tenant_name }} · {{ backend.provider }} · {{ backend.source }}</span><code>{{ backend.id }}</code></div>
              <div class="storage-backend__meta"><span class="ops-status" :class="`is-${statusTone(backend.status)}`">{{ backend.status }}</span><small>{{ backend.knowledge_base_count }} KB</small></div>
            </div>
          </div>
          <div v-else class="ops-empty"><div><span class="ops-empty__icon"><ServerIcon /></span><h3>没有存储后端记录</h3><p>此状态不代表 R2 桶为空；它表示当前 Musuw 环境没有注册活动后端。</p></div></div>
        </div>
      </section>

      <div class="ops-toolbar" style="margin-top:14px">
        <div class="ops-toolbar__left"><t-input v-model="search" class="ops-search" clearable placeholder="搜索文件、对象引用或空间" @enter="applySearch"><template #prefix-icon><SearchIcon /></template></t-input></div>
        <div class="ops-toolbar__right"><span class="ops-muted">{{ data.total }} 个对象引用</span></div>
      </div>
      <div class="ops-table-panel">
        <t-table v-if="data.rows.length" v-accessible-scroll="'Musuw 存储对象引用'" row-key="id" :data="data.rows" :columns="columns" :loading="loading" hover @row-click="handleObjectClick">
          <template #file="{ row }"><div class="ops-cell-primary"><strong>{{ row.file_name || row.title || '未命名' }}</strong><span class="ops-mono">{{ row.id }}</span></div></template>
          <template #workspace="{ row }"><div class="ops-cell-primary"><strong>{{ row.tenant_name }}</strong><span>#{{ row.tenant_id }} · {{ row.knowledge_base_name }}</span></div></template>
          <template #source_size="{ row }"><strong>{{ formatBytes(row.source_bytes) }}</strong></template>
          <template #index_size="{ row }"><strong>{{ formatBytes(row.index_bytes) }}</strong></template>
          <template #quota="{ row }"><div class="ops-cell-primary"><strong>{{ formatBytes(row.measured_used_bytes) }}</strong><span>of {{ formatBytes(row.quota_bytes) }}</span></div></template>
          <template #provider="{ row }"><span class="ops-status" :class="`is-${statusTone(row.storage_backend_status)}`">{{ row.storage_provider || 'unavailable' }}</span></template>
          <template #object="{ row }"><span class="object-ref ops-mono" :title="row.object_reference">{{ row.object_reference || 'unavailable' }}</span></template>
          <template #updated="{ row }"><span class="ops-muted">{{ formatDate(row.updated_at) }}</span></template>
        </t-table>
        <div v-else class="ops-empty"><div><span class="ops-empty__icon"><FileSearchIcon /></span><h3>没有匹配对象引用</h3><p>这是 Musuw 当前记录的真实空状态。R2 官方对象清单只有在 operator credential 可用时才能另行核对。</p></div></div>
        <footer class="ops-table-footer"><span class="ops-table-footer__count">共 {{ data.total }} 条 · 第 {{ page }} 页</span><t-pagination v-model="page" :total="data.total" :page-size="pageSize" :show-page-size="false" size="small" @current-change="load" /></footer>
      </div>
    </template>

    <t-drawer v-model:visible="drawerVisible" :footer="false" size="700px"><template #header><div class="ops-drawer-header"><h2>{{ selected?.file_name || selected?.title || '对象详情' }}</h2><p>来源、计量、配额与物理引用</p></div></template>
      <template v-if="selected"><section class="ops-drawer-section"><h3>完整字段</h3><dl class="ops-definition">
        <div><dt>文档 ID</dt><dd class="ops-mono">{{ selected.id }}</dd></div><div><dt>文件类型</dt><dd>{{ selected.file_type || '—' }}</dd></div>
        <div><dt>原文件 file_size</dt><dd>{{ formatBytes(selected.source_bytes) }}</dd></div><div><dt>索引 storage_size</dt><dd>{{ formatBytes(selected.index_bytes) }}</dd></div>
        <div><dt>tenant.storage_used</dt><dd>{{ formatBytes(selected.measured_used_bytes) }}</dd></div><div><dt>配额</dt><dd>{{ formatBytes(selected.quota_bytes) }}</dd></div>
        <div><dt>Provider</dt><dd>{{ selected.storage_provider || 'unavailable' }}</dd></div><div><dt>Backend</dt><dd class="ops-mono">{{ selected.storage_backend_id || 'unavailable' }}</dd></div>
        <div class="wide"><dt>物理对象引用</dt><dd class="ops-mono">{{ selected.object_reference || 'unavailable' }}</dd></div>
      </dl></section><div class="ops-callout" :class="selected.storage_provider === 's3' ? '' : 'is-warning'"><InfoCircleIcon class="ops-callout__icon"/><div><strong>{{ selected.storage_provider === 's3' ? 'S3/R2 路径已绑定' : '当前记录不是 R2 后端' }}</strong><span>对象引用和官方 R2 清单是独立证据；只有清单中的匹配对象才能证明当前凭据可见该物理对象。</span></div></div></template>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { Directive } from 'vue'
import { ChartBubbleIcon, CheckCircleIcon, CloudIcon, DataBaseIcon, FileIcon, FileSearchIcon, InfoCircleIcon, LinkIcon, SearchIcon, ServerIcon } from 'tdesign-icons-vue-next'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import { formatBytes, formatDate, statusTone } from '../format'
import type { OperationsConfig, StorageData, StorageObjectRow } from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const data = ref<StorageData | null>(null), loading = ref(false), error = ref(''), search = ref(''), page = ref(1), pageSize = 25
const selected = ref<StorageObjectRow | null>(null), drawerVisible = ref(false)
function exposeScrollableTable(element: HTMLElement, label: string) {
  const content = element.querySelector<HTMLElement>('.t-table__content')
  if (!content) return
  content.tabIndex = 0
  content.setAttribute('role', 'region')
  content.setAttribute('aria-label', label)
}
const vAccessibleScroll: Directive<HTMLElement, string> = {
  mounted: (element, binding) => exposeScrollableTable(element, binding.value),
  updated: (element, binding) => exposeScrollableTable(element, binding.value),
}
const columns = [
  { colKey: 'file', title: '文件', minWidth: 230 }, { colKey: 'workspace', title: '空间 / 知识库', minWidth: 190 },
  { colKey: 'source_size', title: '原文件', width: 100 }, { colKey: 'index_size', title: '索引计量', width: 100 }, { colKey: 'quota', title: '空间计量 / 配额', width: 140 },
  { colKey: 'provider', title: 'Provider', width: 110 }, { colKey: 'object', title: '物理对象引用', minWidth: 230 }, { colKey: 'updated', title: '更新时间', width: 160 },
]
const r2Columns = [
  { colKey: 'key', title: '对象 Key', minWidth: 360 },
  { colKey: 'size', title: '对象大小', width: 120 },
  { colKey: 'last_modified', title: '最后修改', width: 180 },
]
async function load() { loading.value = true; error.value = ''; emit('busy', true); try { data.value = await operationsApi.storage({ page: page.value, page_size: pageSize, q: search.value }) } catch (e) { error.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false; emit('busy', false) } }
function applySearch() { page.value = 1; load() }
function openObject(row: StorageObjectRow) { selected.value = row; drawerVisible.value = true }
function handleObjectClick(context: { row: StorageObjectRow }) { openObject(context.row) }
useOperationsReadRecovery(error, loading, load)
onMounted(load); watch(() => props.refreshKey, load)
</script>

<style scoped>
.ops-page-actions a { text-decoration: none; }
.storage-backends { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.storage-backend { min-height: 82px; display: flex; align-items: center; gap: 12px; padding: 13px; border: 1px solid #e4e8ee; border-radius: 9px; }
.storage-backend__icon { width: 38px; height: 38px; display: grid; place-items: center; flex: none; border-radius: 9px; color: #4d64d9; background: #eef2ff; }
.storage-backend__body { min-width: 0; flex: 1; }
.storage-backend__body strong, .storage-backend__body span, .storage-backend__body code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.storage-backend__body strong { color: #344054; font-size: 12px; }.storage-backend__body span { margin-top: 3px; color: #596579; font-size: 10px; }.storage-backend__body code { margin-top: 5px; color: #596579; font-size: 9px; }
.storage-backend__meta { display: grid; justify-items: end; gap: 8px; }.storage-backend__meta small { color: #596579; font-size: 9px; }
.object-ref { display: block; max-width: 270px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r2-summary { margin-bottom: 14px; }
.r2-objects { border-top: 1px solid #e4e8ee; }
.r2-object-key { display: block; max-width: 620px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r2-objects :deep(.t-table__content:focus-visible), .ops-table-panel :deep(.t-table__content:focus-visible) { outline: 2px solid #4d64d9; outline-offset: -2px; }
.ops-definition .wide { grid-column: 1 / -1; }
</style>
