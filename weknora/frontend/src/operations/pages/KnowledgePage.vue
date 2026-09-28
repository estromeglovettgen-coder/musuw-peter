<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div><h1>知识库与文档</h1><p>查看所有空间的知识库、原始文件、解析状态和索引计量。这里只读展示，业务变更继续从用户产品或 Musuw API 完成。</p></div>
      <div class="ops-page-actions"><t-tag variant="light">{{ total }} {{ kind === 'documents' ? '份文档' : '个知识库' }}</t-tag></div>
    </header>

    <div class="ops-toolbar">
      <div class="ops-toolbar__left">
        <div class="ops-segmented"><button type="button" :class="{ 'is-active': kind === 'documents' }" @click="setKind('documents')">文档</button><button type="button" :class="{ 'is-active': kind === 'knowledge_bases' }" @click="setKind('knowledge_bases')">知识库</button></div>
        <t-input v-model="search" class="ops-search" clearable placeholder="搜索标题、文件名、知识库、空间或 ID" @enter="applyFilters"><template #prefix-icon><SearchIcon /></template></t-input>
        <t-select v-if="kind === 'documents'" v-model="status" placeholder="全部解析状态" clearable style="width:160px" @change="applyFilters">
          <t-option value="completed" label="已完成" /><t-option value="processing" label="处理中" /><t-option value="waiting" label="等待" /><t-option value="failed" label="失败" />
        </t-select>
      </div>
      <div class="ops-toolbar__right"><t-button variant="outline" @click="applyFilters"><FilterIcon />筛选</t-button></div>
    </div>

    <div class="ops-table-panel">
      <div v-if="loading && !rows.length" class="ops-loading"><t-loading text="加载知识数据" /></div>
      <div v-else-if="error && !rows.length" class="ops-error"><t-alert theme="error" title="知识数据加载失败" :message="error"><template #operation><t-button size="small" @click="load">重试</t-button></template></t-alert></div>
      <t-table v-else-if="rows.length" row-key="id" :data="rows" :columns="kind === 'documents' ? documentColumns : knowledgeBaseColumns" :loading="loading" hover @row-click="handleRowClick">
        <template #name="{ row }"><div class="ops-cell-primary"><strong>{{ row.title || row.name || row.file_name || '未命名' }}</strong><span :title="row.id">{{ row.file_name || row.type || row.id }}</span></div></template>
        <template #workspace="{ row }"><div class="ops-cell-primary"><strong>{{ row.tenant_name || '—' }}</strong><span class="ops-mono">#{{ row.tenant_id }}</span></div></template>
        <template #knowledge_base="{ row }"><div class="ops-cell-primary"><strong>{{ row.knowledge_base_name || '—' }}</strong><span class="ops-mono">{{ row.knowledge_base_id }}</span></div></template>
        <template #status="{ row }"><span class="ops-status" :class="`is-${statusTone(row.parse_status || (row.failed_count ? 'failed' : 'active'))}`">{{ row.parse_status || (row.failed_count ? `${row.failed_count} 失败` : '正常') }}</span></template>
        <template #documents="{ row }"><div class="ops-cell-primary"><strong>{{ row.document_count }} 文档</strong><span>{{ row.failed_count }} 失败</span></div></template>
        <template #size="{ row }"><div class="ops-cell-primary"><strong>{{ formatBytes(row.source_bytes) }}</strong><span>索引 {{ formatBytes(row.index_bytes) }}</span></div></template>
        <template #storage="{ row }"><div class="ops-cell-primary"><strong>{{ row.storage_provider || '未解析' }}</strong><span>{{ row.storage_backend_status || 'unavailable' }}</span></div></template>
        <template #updated="{ row }"><span class="ops-muted">{{ formatDate(row.updated_at) }}</span></template>
        <template #operation="{ row }"><t-button variant="text" size="small" @click.stop="openRow(row)">详情 <ChevronRightIcon /></t-button></template>
      </t-table>
      <div v-else class="ops-empty"><div><span class="ops-empty__icon"><FileSearchIcon size="21" /></span><h3>没有匹配{{ kind === 'documents' ? '文档' : '知识库' }}</h3><p>当前筛选没有真实记录；清除搜索或状态条件后重试。</p></div></div>
      <footer class="ops-table-footer"><span class="ops-table-footer__count">共 {{ total }} 条 · 第 {{ page }} 页</span><t-pagination v-model="page" :total="total" :page-size="pageSize" :show-page-size="false" size="small" @current-change="load" /></footer>
    </div>

    <t-drawer v-model:visible="drawerVisible" :footer="false" size="720px" :close-btn="true">
      <template #header><div class="ops-drawer-header"><h2>{{ selected?.title || selected?.name || selected?.file_name || '详情' }}</h2><p>{{ kind === 'documents' ? '文档完整字段与存储口径' : '知识库完整字段与聚合计量' }}</p></div></template>
      <template v-if="selected">
        <section class="ops-drawer-section"><h3>标识与归属</h3><dl class="ops-definition">
          <div><dt>ID</dt><dd class="ops-mono">{{ selected.id }}</dd></div><div><dt>类型</dt><dd>{{ selected.type || '—' }}</dd></div>
          <div><dt>空间</dt><dd>{{ selected.tenant_name }} (#{{ selected.tenant_id }})</dd></div><div v-if="kind === 'documents'"><dt>知识库</dt><dd>{{ selected.knowledge_base_name }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatDate(selected.created_at) }}</dd></div><div><dt>更新时间</dt><dd>{{ formatDate(selected.updated_at) }}</dd></div>
        </dl></section>
        <section class="ops-drawer-section"><h3>文件与索引计量</h3><dl class="ops-definition">
          <div><dt>原文件 file_size</dt><dd>{{ formatBytes(selected.source_bytes) }}</dd></div><div><dt>索引 storage_size</dt><dd>{{ formatBytes(selected.index_bytes) }}</dd></div>
          <div><dt>空间 storage_used</dt><dd>{{ formatBytes(selected.storage_used_bytes) }}</dd></div><div><dt>空间 quota</dt><dd>{{ formatBytes(selected.storage_quota_bytes) }}</dd></div>
          <div><dt>存储 provider</dt><dd>{{ selected.storage_provider || 'unavailable' }}</dd></div><div><dt>后端状态</dt><dd>{{ selected.storage_backend_status || 'unavailable' }}</dd></div>
        </dl></section>
        <section v-if="kind === 'documents'" class="ops-drawer-section"><h3>解析与对象</h3><dl class="ops-definition">
          <div><dt>解析状态</dt><dd>{{ selected.parse_status || '—' }}</dd></div><div><dt>启用状态</dt><dd>{{ selected.enable_status || '—' }}</dd></div>
          <div><dt>来源 / channel</dt><dd>{{ selected.source || '—' }} / {{ selected.channel || '—' }}</dd></div><div><dt>处理完成</dt><dd>{{ formatDate(selected.processed_at) }}</dd></div>
          <div class="wide"><dt>物理对象引用</dt><dd class="ops-mono">{{ selected.object_reference || 'unavailable' }}</dd></div>
          <div v-if="selected.error_message" class="wide"><dt>错误</dt><dd class="error-text">{{ selected.error_message }}</dd></div>
        </dl></section>
        <section v-else class="ops-drawer-section"><h3>文档聚合</h3><dl class="ops-definition">
          <div><dt>文档数</dt><dd>{{ selected.document_count }}</dd></div><div><dt>失败数</dt><dd>{{ selected.failed_count }}</dd></div>
          <div><dt>存储后端 ID</dt><dd class="ops-mono">{{ selected.storage_backend_id || 'unavailable' }}</dd></div><div><dt>创建者 ID</dt><dd class="ops-mono">{{ selected.creator_id || '—' }}</dd></div>
        </dl></section>
      </template>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ChevronRightIcon, FileSearchIcon, FilterIcon, SearchIcon } from 'tdesign-icons-vue-next'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import { formatBytes, formatDate, statusTone } from '../format'
import type { DocumentRow, KnowledgeBaseRow, OperationsConfig } from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const kind = ref<'documents' | 'knowledge_bases'>('documents'), rows = ref<Array<DocumentRow | KnowledgeBaseRow>>([])
const total = ref(0), page = ref(1), pageSize = 25, search = ref(''), status = ref(''), loading = ref(false), error = ref('')
const selected = ref<any>(null), drawerVisible = ref(false)
const documentColumns = [
  { colKey: 'name', title: '文档', minWidth: 260 }, { colKey: 'workspace', title: '空间', width: 170 }, { colKey: 'knowledge_base', title: '知识库', minWidth: 190 },
  { colKey: 'status', title: '解析', width: 105 }, { colKey: 'size', title: '原文件 / 索引', width: 130 }, { colKey: 'storage', title: '存储', width: 110 },
  { colKey: 'updated', title: '更新时间', width: 160 }, { colKey: 'operation', title: '', width: 78, fixed: 'right' as const },
]
const knowledgeBaseColumns = [
  { colKey: 'name', title: '知识库', minWidth: 280 }, { colKey: 'workspace', title: '空间', width: 180 }, { colKey: 'documents', title: '内容', width: 130 },
  { colKey: 'size', title: '原文件 / 索引', width: 140 }, { colKey: 'storage', title: '存储', width: 120 }, { colKey: 'updated', title: '更新时间', width: 165 },
  { colKey: 'operation', title: '', width: 78, fixed: 'right' as const },
]
async function load() {
  loading.value = true; error.value = ''; emit('busy', true)
  try { const result = await operationsApi.knowledge<any>({ kind: kind.value, page: page.value, page_size: pageSize, q: search.value, status: status.value }); rows.value = result.rows; total.value = result.total }
  catch (loadError) { error.value = loadError instanceof Error ? loadError.message : '加载失败' }
  finally { loading.value = false; emit('busy', false) }
}
function setKind(value: 'documents' | 'knowledge_bases') { kind.value = value; status.value = ''; page.value = 1; rows.value = []; load() }
function applyFilters() { page.value = 1; load() }
function openRow(row: unknown) { selected.value = row; drawerVisible.value = true }
function handleRowClick(context: { row: DocumentRow | KnowledgeBaseRow }) { openRow(context.row) }
useOperationsReadRecovery(error, loading, load)
onMounted(load)
watch(() => props.refreshKey, load)
</script>

<style scoped>
.ops-definition .wide { grid-column: 1 / -1; }
.error-text { color: #b4232c !important; white-space: pre-wrap; }
</style>
