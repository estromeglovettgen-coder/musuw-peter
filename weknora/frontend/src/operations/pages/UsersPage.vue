<template>
  <div class="ops-page">
    <header class="ops-page-header">
      <div><h1>用户</h1><p>用户、工作空间、套餐、存储和 OpenRouter 用量的一体化支持视图。点击任意行查看完整字段与脱敏调查结果。</p></div>
      <div class="ops-page-actions"><t-tag variant="light">{{ total }} 位用户</t-tag></div>
    </header>

    <div class="ops-toolbar">
      <div class="ops-toolbar__left">
        <t-input v-model="search" class="ops-search" clearable placeholder="搜索邮箱、用户名、用户 ID 或空间" @enter="applyFilters">
          <template #prefix-icon><SearchIcon /></template>
        </t-input>
        <t-select v-model="plan" placeholder="全部套餐" clearable style="width:140px" @change="applyFilters">
          <t-option value="free" label="Free" /><t-option value="plus" label="Plus" /><t-option value="pro" label="Pro" /><t-option value="max" label="Max" />
        </t-select>
        <t-select v-model="state" placeholder="全部状态" clearable style="width:140px" @change="applyFilters">
          <t-option value="active" label="活跃" /><t-option value="inactive" label="已停用" />
        </t-select>
      </div>
      <div class="ops-toolbar__right"><t-button variant="outline" @click="applyFilters"><FilterIcon />筛选</t-button></div>
    </div>

    <div class="ops-table-panel">
      <div v-if="loading && !rows.length" class="ops-loading"><t-loading text="加载用户" /></div>
      <div v-else-if="error && !rows.length" class="ops-error"><t-alert theme="error" title="用户加载失败" :message="error"><template #operation><t-button size="small" @click="load">重试</t-button></template></t-alert></div>
      <t-table v-else-if="rows.length" row-key="id" :data="rows" :columns="columns" :loading="loading" hover @row-click="handleRowClick">
        <template #identity="{ row }">
          <div class="user-identity"><t-avatar size="34px">{{ initials(row.username || row.email) }}</t-avatar><div class="ops-cell-primary"><strong>{{ row.username || '未命名用户' }}</strong><span :title="row.email">{{ row.email }}</span></div></div>
        </template>
        <template #workspace="{ row }"><div class="ops-cell-primary"><strong>{{ row.tenant_name || '未绑定空间' }}</strong><span class="ops-mono">#{{ row.tenant_id || '—' }}</span></div></template>
        <template #plan="{ row }"><t-tag size="small" :theme="statusTone(row.plan)" variant="light-outline">{{ String(row.plan || 'free').toUpperCase() }}</t-tag></template>
        <template #state="{ row }"><span class="ops-status" :class="`is-${row.is_active && row.tenant_status === 'active' ? 'success' : 'danger'}`">{{ row.is_active && row.tenant_status === 'active' ? '活跃' : '停用' }}</span></template>
        <template #content="{ row }"><div class="ops-cell-primary"><strong>{{ row.knowledge_base_count }} 知识库 · {{ row.document_count }} 文档</strong><span>{{ formatBytes(row.source_bytes) }} 原文件</span></div></template>
        <template #storage="{ row }"><div class="storage-cell"><div><span>{{ formatBytes(row.storage_used_bytes) }}</span><span>{{ formatBytes(row.storage_quota_bytes) }}</span></div><div class="ops-progress" :class="percent(row.storage_used_bytes, row.storage_quota_bytes) > 90 ? 'is-danger' : ''"><span :style="{ width: `${percent(row.storage_used_bytes, row.storage_quota_bytes)}%` }" /></div></div></template>
        <template #created="{ row }"><span class="ops-muted">{{ formatDate(row.created_at) }}</span></template>
        <template #operation="{ row }"><t-button variant="text" size="small" @click.stop="openUser(row)">详情 <ChevronRightIcon /></t-button></template>
      </t-table>
      <div v-else class="ops-empty"><div><span class="ops-empty__icon"><UserSearchIcon size="21" /></span><h3>没有匹配用户</h3><p>清除筛选条件后重试；这不是 datasource 加载占位。</p></div></div>
      <footer class="ops-table-footer"><span class="ops-table-footer__count">共 {{ total }} 条 · 第 {{ page }} 页</span><t-pagination v-model="page" :total="total" :page-size="pageSize" :show-page-size="false" size="small" @current-change="load" /></footer>
    </div>

    <t-drawer v-model:visible="drawerVisible" :footer="false" size="760px" :close-btn="true">
      <template #header><div class="ops-drawer-header"><h2>{{ selected?.username || selected?.email || '用户详情' }}</h2><p>{{ selected?.email }} · 用户与工作空间完整运营信息</p></div></template>
      <template v-if="selected">
        <section class="ops-drawer-section">
          <div class="user-detail-heading">
            <t-avatar size="48px">{{ initials(selected.username || selected.email) }}</t-avatar>
            <div><strong>{{ selected.username || '未命名用户' }}</strong><span>{{ selected.email }}</span></div>
            <t-tag :theme="selected.is_active ? 'success' : 'danger'" variant="light">{{ selected.is_active ? '活跃' : '停用' }}</t-tag>
            <t-button theme="primary" @click="openManage">管理用户</t-button>
            <t-button theme="danger" variant="outline" :disabled="selected.is_system_admin || erasing" @click="eraseVisible = true">彻底注销</t-button>
          </div>
        </section>
        <section class="ops-drawer-section"><h3>账号与空间</h3><dl class="ops-definition">
          <div><dt>用户 ID</dt><dd class="ops-mono">{{ selected.id }}</dd></div><div><dt>系统管理员</dt><dd>{{ selected.is_system_admin ? '是' : '否' }}</dd></div>
          <div><dt>空间</dt><dd>{{ selected.tenant_name || '—' }} (#{{ selected.tenant_id || '—' }})</dd></div><div><dt>空间状态</dt><dd>{{ selected.tenant_status || '—' }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ formatDate(selected.created_at) }}</dd></div><div><dt>更新时间</dt><dd>{{ formatDate(selected.updated_at) }}</dd></div>
        </dl></section>
        <section class="ops-drawer-section"><h3>套餐与计量</h3>
          <div v-if="detailLoading && !entitlement" class="detail-loading"><t-loading size="small" text="读取 provider-backed entitlement" /></div>
          <div v-else-if="detailError && !entitlement" class="ops-callout is-danger"><ErrorCircleIcon class="ops-callout__icon"/><div><strong>额度读取失败</strong><span>{{ detailError }}</span></div></div>
          <dl v-else class="ops-definition">
            <div><dt>有效套餐</dt><dd>{{ entitlement?.plan?.toUpperCase() || selected.plan?.toUpperCase() || 'FREE' }}</dd></div><div><dt>套餐状态</dt><dd>{{ entitlement?.plan_status || selected.plan_status || '—' }}</dd></div>
            <div><dt>空间计量</dt><dd>{{ formatBytes(entitlement?.storage_used_bytes ?? selected.storage_used_bytes) }}</dd></div><div><dt>空间配额</dt><dd>{{ formatBytes(entitlement?.storage_quota_bytes ?? selected.storage_quota_bytes) }}</dd></div>
            <div><dt>OpenRouter 已用</dt><dd>{{ entitlement ? formatMicrousd(entitlement.openrouter_used_microusd) : 'unavailable' }}</dd></div><div><dt>OpenRouter 剩余</dt><dd>{{ entitlement ? formatMicrousd(entitlement.openrouter_remaining_microusd) : 'unavailable' }}</dd></div>
            <div><dt>AI 额度状态</dt><dd>{{ entitlement?.openrouter_credits_status || '—' }}</dd></div>
            <div><dt>额度周期结束</dt><dd>{{ formatDate(entitlement?.openrouter_credit_period_end || selected.open_router_credit_period_end) }}</dd></div><div><dt>Paddle 周期结束</dt><dd>{{ formatDate(entitlement?.paddle_current_period_end || selected.paddle_current_period_end) }}</dd></div>
          </dl>
        </section>
        <section class="ops-drawer-section"><h3>赠送套餐</h3>
          <div v-if="detailLoading && !entitlement" class="detail-loading"><t-loading size="small" text="读取赠送资格" /></div>
          <div v-else-if="detailError && !entitlement" class="ops-callout is-warning"><InfoCircleIcon class="ops-callout__icon"/><div><strong>暂不能判断赠送资格</strong><span>{{ detailError }}</span></div></div>
          <template v-else-if="entitlement">
            <div class="complimentary-summary">
              <div><span class="ops-muted">当前来源</span><strong>{{ planSourceLabel }}</strong></div>
              <div><span class="ops-muted">赠送套餐</span><strong>{{ entitlement.complimentary_plan?.toUpperCase() || '—' }}</strong></div>
              <div><span class="ops-muted">赠送状态</span><t-tag size="small" :theme="complimentaryActive ? 'success' : (hasComplimentaryGrant ? 'warning' : 'default')" variant="light">{{ complimentaryStatusLabel }}</t-tag></div>
              <div><span class="ops-muted">到期时间</span><strong>{{ formatDate(entitlement.complimentary_expires_at) }}</strong></div>
            </div>
            <div v-if="complimentaryEligible" class="complimentary-form">
              <div class="complimentary-form__fields">
                <label><span>套餐</span><t-select v-model="gift.plan" :disabled="giftSubmitting"><t-option value="plus" label="Plus" /><t-option value="pro" label="Pro" /><t-option value="max" label="Max" /></t-select></label>
                <label><span>到期时间（本地时间）</span><input v-model="gift.expiresAtLocal" class="complimentary-datetime" type="datetime-local" :disabled="giftSubmitting" /></label>
              </div>
              <div class="complimentary-form__actions"><span v-if="gift.grantId" class="ops-muted ops-mono">操作 ID 将在重试时复用</span><t-button theme="primary" :loading="giftSubmitting" :disabled="!canSubmitGift" @click="submitComplimentaryGrant">赠送套餐</t-button></div>
            </div>
            <div v-else-if="!complimentaryActive" class="ops-callout is-warning"><InfoCircleIcon class="ops-callout__icon"/><div><strong>当前不可赠送</strong><span>仅 configured_plan 为 Free、且没有 Paddle Customer/Subscription 绑定的空间可接受赠送。</span></div></div>
            <div v-if="hasComplimentaryGrant" class="complimentary-revoke">
              <div class="ops-callout is-danger"><ErrorCircleIcon class="ops-callout__icon"/><div><strong>撤销当前赠送</strong><span>撤销后立即按底层套餐收敛权限；过期赠送也可用当前 grant ID 清理元数据。</span></div></div>
              <div class="complimentary-form__actions"><span class="ops-muted ops-mono">{{ entitlement.complimentary_grant_id }}</span><t-button theme="danger" variant="outline" :loading="revokeSubmitting" :disabled="!canSubmitRevoke" @click="submitComplimentaryRevoke">撤销赠送</t-button></div>
            </div>
          </template>
        </section>
        <section class="ops-drawer-section"><h3>内容</h3><dl class="ops-definition">
          <div><dt>知识库</dt><dd>{{ selected.knowledge_base_count }}</dd></div><div><dt>文档</dt><dd>{{ selected.document_count }}</dd></div>
          <div><dt>原文件总量</dt><dd>{{ formatBytes(selected.source_bytes) }}</dd></div><div><dt>索引计量</dt><dd>{{ formatBytes(selected.index_bytes) }}</dd></div>
        </dl></section>
        <section class="ops-drawer-section"><h3>账单标识</h3><dl class="ops-definition">
          <div><dt>Paddle Customer</dt><dd class="ops-mono">{{ selected.paddle_customer_id || '未绑定' }}</dd></div><div><dt>Paddle Subscription</dt><dd class="ops-mono">{{ selected.paddle_subscription_id || '未绑定' }}</dd></div>
          <div><dt>计费周期</dt><dd>{{ selected.paddle_billing_period || '—' }}</dd></div><div><dt>订阅状态</dt><dd>{{ selected.plan_status || '—' }}</dd></div>
        </dl></section>
        <section class="ops-drawer-section"><h3>支持调查（严格脱敏）</h3>
          <div v-if="detailLoading && !investigation" class="detail-loading"><t-loading size="small" text="关联会话、文档、运行队列和审计" /></div>
          <div v-else-if="investigationError" class="ops-callout is-warning"><InfoCircleIcon class="ops-callout__icon"/><div><strong>部分调查能力不可用</strong><span>{{ investigationError }}</span></div></div>
          <pre v-else-if="investigation" class="ops-json">{{ JSON.stringify(investigation, null, 2) }}</pre>
          <div v-else class="ops-callout"><InfoCircleIcon class="ops-callout__icon"/><div><strong>暂无调查数据</strong><span>接口不会返回 prompt、content、attachments、keys 或 payload。</span></div></div>
        </section>
      </template>
    </t-drawer>

    <t-dialog v-model:visible="manageVisible" header="管理用户空间" width="580px" :confirm-btn="{ content: '确认执行', theme: 'danger', disabled: !canSubmitManage, loading: managing }" @confirm="submitManage">
      <div v-if="selected" class="manage-form">
        <div class="ops-callout is-warning"><InfoCircleIcon class="ops-callout__icon"/><div><strong>所有写操作经过 Musuw 管理 API</strong><span>不会直接修改数据库。套餐仍只由 Paddle 签名事件负责，当前表单不能改套餐。</span></div></div>
        <t-form label-align="top">
          <t-form-item label="空间状态"><t-radio-group v-model="manage.status"><t-radio value="active">启用</t-radio><t-radio value="inactive">停用</t-radio></t-radio-group></t-form-item>
          <t-form-item label="存储配额（GiB）"><t-input-number v-model="manage.quotaGiB" :min="1" :max="1024" theme="column" /></t-form-item>
          <t-form-item label="OpenRouter 额度"><t-radio-group v-model="manage.creditMode"><t-radio value="keep">保持不变</t-radio><t-radio value="reset">按当前套餐重置</t-radio><t-radio value="custom">手动设置剩余金额</t-radio></t-radio-group></t-form-item>
          <t-form-item v-if="manage.creditMode === 'custom'" label="剩余金额（USD）"><t-input-number v-model="manage.creditUsd" :min="0" :decimal-places="2" /></t-form-item>
          <t-form-item :label="`输入 UPDATE:${selected.tenant_id} 以确认`"><t-input v-model="manage.confirmation" :placeholder="`UPDATE:${selected.tenant_id}`" /></t-form-item>
        </t-form>
      </div>
    </t-dialog>

    <t-dialog
      v-model:visible="eraseVisible"
      header="彻底注销用户"
      width="520px"
      :close-on-overlay-click="!erasing"
      :close-btn="!erasing"
      :cancel-btn="{ content: '取消', disabled: erasing }"
      :confirm-btn="{ content: '确认彻底注销', theme: 'danger', loading: erasing, disabled: erasing }"
      @confirm="submitErasure"
    >
      <div v-if="selected" class="manage-form">
        <div class="ops-callout is-danger">
          <ErrorCircleIcon class="ops-callout__icon" />
          <div>
            <strong>此操作不可撤销</strong>
            <span>将立即停用 {{ selected.email || selected.id }}，并异步清理账号、个人空间和可删除的产品数据。</span>
          </div>
        </div>
        <p class="ops-muted">如存在 Paddle 订阅，系统会先安排停止后续自动续费，再立即停用账号并进入清理；不会自动退款，最终清理可能等待 Paddle 确认订阅已取消。</p>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { ChevronRightIcon, ErrorCircleIcon, FilterIcon, InfoCircleIcon, SearchIcon, UserSearchIcon } from 'tdesign-icons-vue-next'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import { formatBytes, formatDate, formatMicrousd, percent, statusTone } from '../format'
import type { ComplimentaryPlan, InvestigationData, OperationsConfig, TenantEntitlement, UserRow } from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const rows = ref<UserRow[]>([]), total = ref(0), page = ref(1), pageSize = 25
const search = ref(''), plan = ref(''), state = ref(''), loading = ref(false), error = ref('')
const selected = ref<UserRow | null>(null), drawerVisible = ref(false), detailLoading = ref(false)
const entitlement = ref<TenantEntitlement | null>(null), investigation = ref<InvestigationData | null>(null)
const detailError = ref(''), investigationError = ref('')
const manageVisible = ref(false), managing = ref(false)
const eraseVisible = ref(false), erasing = ref(false)
const manage = reactive({ status: 'active', quotaGiB: 5, creditMode: 'keep', creditUsd: 0, confirmation: '' })
const gift = reactive<{ plan: ComplimentaryPlan; expiresAtLocal: string; grantId: string }>({ plan: 'pro', expiresAtLocal: '', grantId: '' })
const giftSubmitting = ref(false), revokeSubmitting = ref(false)

const columns = [
  { colKey: 'identity', title: '用户', minWidth: 240 }, { colKey: 'workspace', title: '工作空间', minWidth: 170 },
  { colKey: 'plan', title: '套餐', width: 84 }, { colKey: 'state', title: '状态', width: 90 },
  { colKey: 'content', title: '内容', width: 150 }, { colKey: 'storage', title: '空间计量 / 配额', width: 190 },
  { colKey: 'created', title: '注册时间', width: 160 }, { colKey: 'operation', title: '', width: 80, fixed: 'right' as const },
]

function initials(value: string) { return String(value || '?').trim().slice(0, 1).toUpperCase() }
function handleRowClick(context: { row: UserRow }) { openUser(context.row) }
function localDateTimeInput(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function newGrantId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0
    const value = character === 'x' ? random : (random & 0x3 | 0x8)
    return value.toString(16)
  })
}
function resetGiftForm() {
  gift.plan = 'pro'; gift.expiresAtLocal = localDateTimeInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); gift.grantId = ''
}
const configuredPlan = computed(() => String(entitlement.value?.configured_plan || 'free').toLowerCase())
const paddleBound = computed(() => Boolean(entitlement.value?.paddle_customer_id || entitlement.value?.paddle_subscription_id))
const complimentaryPlan = computed(() => String(entitlement.value?.complimentary_plan || '').toLowerCase())
const hasComplimentaryGrant = computed(() => ['plus', 'pro', 'max'].includes(complimentaryPlan.value) && Boolean(entitlement.value?.complimentary_grant_id))
const complimentaryActive = computed(() => {
  if (!hasComplimentaryGrant.value || !entitlement.value?.complimentary_expires_at) return false
  const expiresAt = Date.parse(entitlement.value.complimentary_expires_at)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
})
const complimentaryEligible = computed(() => configuredPlan.value === 'free' && !paddleBound.value && !complimentaryActive.value)
const planSourceLabel = computed(() => {
  const source = String(entitlement.value?.plan_source || '').toLowerCase()
  if (source === 'complimentary') return '运营赠送'
  if (source === 'paddle') return 'Paddle'
  if (source === 'free') return 'Free'
  return source || 'Free'
})
const complimentaryStatusLabel = computed(() => {
  if (!hasComplimentaryGrant.value) return '未设置'
  return complimentaryActive.value ? '生效中' : '已过期'
})
const giftExpiresAtIso = computed(() => {
  if (!gift.expiresAtLocal) return ''
  const date = new Date(gift.expiresAtLocal)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
})
const canSubmitGift = computed(() => Boolean(selected.value && complimentaryEligible.value && ['plus', 'pro', 'max'].includes(gift.plan) && giftExpiresAtIso.value && Date.parse(giftExpiresAtIso.value) > Date.now()))
const canSubmitRevoke = computed(() => Boolean(selected.value && hasComplimentaryGrant.value && entitlement.value?.complimentary_grant_id))
async function load() {
  loading.value = true; error.value = ''; emit('busy', true)
  try { const result = await operationsApi.users({ page: page.value, page_size: pageSize, q: search.value, plan: plan.value, state: state.value }); rows.value = result.rows; total.value = result.total }
  catch (loadError) { error.value = loadError instanceof Error ? loadError.message : '加载失败' }
  finally { loading.value = false; emit('busy', false) }
}
function applyFilters() { page.value = 1; load() }
async function openUser(row: UserRow) {
  if (selected.value?.tenant_id !== row.tenant_id) resetGiftForm()
  selected.value = row; drawerVisible.value = true; detailLoading.value = true
  entitlement.value = null; investigation.value = null; detailError.value = ''; investigationError.value = ''
  const [entitlementResult, investigationResult] = await Promise.allSettled([operationsApi.entitlement(row.tenant_id), operationsApi.investigation(row.id)])
  if (entitlementResult.status === 'fulfilled') entitlement.value = entitlementResult.value
  else detailError.value = entitlementResult.reason instanceof Error ? entitlementResult.reason.message : '额度服务不可用'
  if (investigationResult.status === 'fulfilled') investigation.value = investigationResult.value
  else investigationError.value = investigationResult.reason instanceof Error ? investigationResult.reason.message : '调查服务不可用'
  detailLoading.value = false
}
async function refreshSelectedUser() {
  if (!selected.value) return
  const selectedId = selected.value.id
  await load()
  const refreshed = rows.value.find((row) => row.id === selectedId)
  if (refreshed) await openUser(refreshed)
}
async function submitComplimentaryGrant() {
  if (!selected.value || !canSubmitGift.value || giftSubmitting.value) return
  if (!gift.grantId) gift.grantId = newGrantId()
  giftSubmitting.value = true
  try {
    await operationsApi.grantComplimentaryPlan(selected.value.tenant_id, {
      plan: gift.plan,
      expires_at: giftExpiresAtIso.value,
      grant_id: gift.grantId,
    })
  } catch (grantError) {
    MessagePlugin.error(grantError instanceof Error ? grantError.message : '赠送失败，可使用相同操作 ID 重试')
    giftSubmitting.value = false
    return
  }
  MessagePlugin.success('赠送套餐已提交')
  resetGiftForm()
  try {
    await refreshSelectedUser()
  } catch (refreshError) {
    MessagePlugin.warning(refreshError instanceof Error ? `赠送已完成，但详情刷新失败：${refreshError.message}` : '赠送已完成，但详情刷新失败')
  } finally {
    giftSubmitting.value = false
  }
}
async function submitComplimentaryRevoke() {
  if (!selected.value || !canSubmitRevoke.value || revokeSubmitting.value) return
  revokeSubmitting.value = true
  try {
    await operationsApi.revokeComplimentaryPlan(selected.value.tenant_id, {
      grant_id: entitlement.value?.complimentary_grant_id || '',
    })
  } catch (revokeError) {
    MessagePlugin.error(revokeError instanceof Error ? revokeError.message : '撤销失败')
    revokeSubmitting.value = false
    return
  }
  MessagePlugin.success('赠送套餐已撤销')
  try {
    await refreshSelectedUser()
  } catch (refreshError) {
    MessagePlugin.warning(refreshError instanceof Error ? `撤销已完成，但详情刷新失败：${refreshError.message}` : '撤销已完成，但详情刷新失败')
  } finally {
    revokeSubmitting.value = false
  }
}
function openManage() {
  if (!selected.value) return
  manage.status = selected.value.tenant_status || 'active'
  manage.quotaGiB = Math.max(1, Math.round(Number(selected.value.storage_quota_bytes || 0) / 1024 ** 3))
  manage.creditMode = 'keep'; manage.creditUsd = 0; manage.confirmation = ''; manageVisible.value = true
}
const canSubmitManage = computed(() => Boolean(selected.value && manage.confirmation === `UPDATE:${selected.value.tenant_id}` && manage.quotaGiB > 0 && (manage.creditMode !== 'custom' || manage.creditUsd >= 0)))
async function submitManage() {
  if (!selected.value || !canSubmitManage.value) return
  managing.value = true
  try {
    await operationsApi.updateTenant(selected.value.tenant_id, { status: manage.status, storage_quota_bytes: Math.round(manage.quotaGiB * 1024 ** 3) })
    if (manage.creditMode === 'reset') entitlement.value = await operationsApi.updateCredits(selected.value.tenant_id, { reset: true })
    if (manage.creditMode === 'custom') entitlement.value = await operationsApi.updateCredits(selected.value.tenant_id, { remaining_microusd: Math.round(manage.creditUsd * 1_000_000) })
    MessagePlugin.success('用户空间已通过 Musuw 管理 API 更新')
    manageVisible.value = false; await load(); if (selected.value) await openUser(rows.value.find((row) => row.id === selected.value?.id) || selected.value)
  } catch (manageError) { MessagePlugin.error(manageError instanceof Error ? manageError.message : '更新失败') }
  finally { managing.value = false }
}
async function submitErasure() {
  if (!selected.value || erasing.value) return
  erasing.value = true
  try {
    const result = await operationsApi.eraseUser(selected.value.id)
    if (result.accepted !== true) throw new Error('注销任务未被接受')
    MessagePlugin.success('注销任务已接受，账号已停用并进入清理流程')
    eraseVisible.value = false
    drawerVisible.value = false
    selected.value = null
    await load()
  } catch (eraseError) {
    MessagePlugin.error(eraseError instanceof Error ? eraseError.message : '注销失败')
  } finally {
    erasing.value = false
  }
}
useOperationsReadRecovery(error, loading, load)
onMounted(load)
watch(() => props.refreshKey, load)
</script>

<style scoped>
.user-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.user-identity .ops-cell-primary { min-width: 0; }
.storage-cell { width: 160px; }
.storage-cell > div:first-child { display: flex; justify-content: space-between; margin-bottom: 7px; color: #596579; font-size: 10px; }
.storage-cell > div:first-child span:last-child { color: #596579; }
.storage-cell .ops-progress { height: 5px; }
.user-detail-heading { display: flex; align-items: center; gap: 12px; }
.user-detail-heading > div:nth-child(2) { min-width: 0; flex: 1; }
.user-detail-heading strong, .user-detail-heading span { display: block; }
.user-detail-heading strong { color: #273142; font-size: 15px; }
.user-detail-heading span { overflow: hidden; margin-top: 4px; color: #596579; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.detail-loading { min-height: 80px; display: grid; place-items: center; }
.manage-form { display: grid; gap: 18px; }
.complimentary-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; margin-bottom: 16px; }
.complimentary-summary > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #edf0f3; font-size: 11px; }
.complimentary-summary strong { color: #344054; font-size: 12px; font-weight: 620; }
.complimentary-form, .complimentary-revoke { display: grid; gap: 13px; }
.complimentary-form + .complimentary-revoke { margin-top: 18px; padding-top: 18px; border-top: 1px solid #edf0f3; }
.complimentary-form label, .complimentary-revoke label { display: grid; gap: 6px; color: #596579; font-size: 11px; }
.complimentary-form__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.complimentary-datetime { width: 100%; height: 32px; padding: 0 10px; border: 1px solid #dfe3e8; border-radius: 7px; color: #344054; background: #fff; font-size: 12px; }
.complimentary-datetime:focus { border-color: #506de2; outline: 2px solid rgba(80,109,226,.12); }
.complimentary-form__actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.complimentary-form__actions .ops-muted { margin-right: auto; }
@media (max-width: 620px) {
  .complimentary-summary, .complimentary-form__fields { grid-template-columns: 1fr; }
}
</style>
