<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { generateUUID } from '@/api/embed'
import { resetUserPassword } from '@/api/system'
import { fireMembershipApi, type FirePlan, type FireUser, type FireUserDetail, type FireOverview, type FireAdjustment, type FireImageCall } from '@/api/fire-membership'
import { fireError, formatMembershipDate, formatTokens, membershipStatusLabel } from '@/utils/fireMembershipFormat'
import FireUsageTable from '@/components/fire/FireUsageTable.vue'

const auth = useAuthStore(), { locale } = useI18n()
const tokens = (value: unknown) => formatTokens(value, locale.value)
const date = (value?: string | null) => formatMembershipDate(value, locale.value)
const tab = ref('users'), query = ref(''), page = ref(1), users = ref<FireUser[]>([]), total = ref(0), plans = ref<FirePlan[]>([]), overview = ref<FireOverview | null>(null)
const loading = ref(false), error = ref('')
const plansLoading = ref(false), overviewLoading = ref(false), plansLoaded = ref(false)
const plansError = ref(''), overviewError = ref('')
const detail = ref<FireUserDetail | null>(null), selected = ref<FireUser | null>(null), drawer = ref(false), detailLoading = ref(false), detailError = ref('')
let usersGeneration = 0, detailGeneration = 0, metaGeneration = 0
let metaPending: Promise<void> | null = null, refreshPending: Promise<void> | null = null
const enabledPlans = computed(() => plans.value.filter(plan => plan.active))
const columns = [{ colKey: 'identity', title: '用户', minWidth: 180 }, { colKey: 'plan', title: '套餐', minWidth: 130 }, { colKey: 'status', title: '状态', width: 110 }, { colKey: 'balance', title: '剩余 Token', minWidth: 150 }, { colKey: 'expiry', title: '到期时间', minWidth: 170 }, { colKey: 'operation', title: '', width: 80 }]
async function loadUsers() {
  if (!auth.isSystemAdmin) return
  const generation = ++usersGeneration; loading.value = true
  try { const result = await fireMembershipApi.users(query.value.trim(), page.value); if (generation !== usersGeneration) return; users.value = result.items || []; total.value = result.total; error.value = '' }
  catch (cause) { if (generation === usersGeneration) error.value = fireError(cause) }
  finally { if (generation === usersGeneration) loading.value = false }
}
async function loadMeta(force = false) {
  if (!auth.isSystemAdmin) return
  if (metaPending && !force) return metaPending
  const generation = ++metaGeneration
  plansLoading.value = true; overviewLoading.value = true
  const work = Promise.all([
    fireMembershipApi.overview()
      .then(result => { if (generation === metaGeneration) { overview.value = result; overviewError.value = '' } })
      .catch(cause => { if (generation === metaGeneration) overviewError.value = fireError(cause) })
      .finally(() => { if (generation === metaGeneration) overviewLoading.value = false }),
    fireMembershipApi.plans()
      .then(result => { if (generation === metaGeneration) { plans.value = result || []; plansLoaded.value = true; plansError.value = '' } })
      .catch(cause => { if (generation === metaGeneration) plansError.value = fireError(cause) })
      .finally(() => { if (generation === metaGeneration) plansLoading.value = false }),
  ]).then(() => {}).finally(() => { if (generation === metaGeneration) metaPending = null })
  metaPending = work
  return work
}
async function refresh(force = false) {
  if (refreshPending && !force) return refreshPending
  const work: Promise<void> = Promise.all([loadUsers(), loadMeta(force)]).then(() => {}).finally(() => { if (refreshPending === work) refreshPending = null })
  refreshPending = work
  return work
}
async function openUser(user: FireUser) {
  selected.value = user; drawer.value = true; detail.value = null; detailError.value = ''; detailLoading.value = true
  const generation = ++detailGeneration
  try { const result = await fireMembershipApi.user(user.id); if (generation === detailGeneration && drawer.value) detail.value = result }
  catch (cause) { if (generation === detailGeneration) detailError.value = fireError(cause) }
  finally { if (generation === detailGeneration) detailLoading.value = false }
}
const detailMembership = computed(() => detail.value?.membership || selected.value?.membership)
const planVisible = ref(false), planSaving = ref(false), planError = ref(''), editingPlanId = ref('')
const planForm = ref({ name: '', duration_days: 30, token_limit: 1000000, question_limit: 0, image_limit: 0, active: true })
function openPlan(plan?: FirePlan) { editingPlanId.value = plan?.id || ''; planForm.value = plan ? { name: plan.name, duration_days: plan.duration_days, token_limit: plan.token_limit, question_limit: plan.question_limit || 0, image_limit: plan.image_limit || 0, active: plan.active } : { name: '', duration_days: 30, token_limit: 1000000, question_limit: 0, image_limit: 0, active: true }; planError.value = ''; planVisible.value = true }
async function savePlan() {
  if (planSaving.value) return
  if (!planForm.value.name.trim() || !Number.isSafeInteger(planForm.value.duration_days) || planForm.value.duration_days <= 0 || !Number.isSafeInteger(planForm.value.token_limit) || planForm.value.token_limit <= 0) { planError.value = '请填写套餐名称、正整数天数和 Token 额度'; return }
  if (!Number.isSafeInteger(planForm.value.question_limit) || planForm.value.question_limit < 0) { planError.value = '问答上限请填写非负整数，0 表示不限条数'; return }
  if (!Number.isSafeInteger(planForm.value.image_limit) || planForm.value.image_limit < 0) { planError.value = '图片张数请填写非负整数，0 表示不赠送图片'; return }
  planSaving.value = true; planError.value = ''
  try { await fireMembershipApi.savePlan({ ...planForm.value, name: planForm.value.name.trim() }, editingPlanId.value || undefined); planVisible.value = false; await loadMeta(true) }
  catch (cause) { planError.value = fireError(cause) }
  finally { planSaving.value = false }
}
const createVisible = ref(false), createSaving = ref(false), createError = ref(''), createOperation = ref('')
const createForm = ref({ username: '', email: '', password: '', plan_id: '', duration_days: 0, tokens: 0, questions: '' as number | string, images: '' as number | string })
const createPlan = computed(() => enabledPlans.value.find(plan => plan.id === createForm.value.plan_id))
const credentials = ref<{ username: string; email: string; password?: string } | null>(null)
function openCreate() { createForm.value = { username: '', email: '', password: '', plan_id: enabledPlans.value[0]?.id || '', duration_days: 0, tokens: 0, questions: '' as number | string, images: '' as number | string }; createOperation.value = generateUUID(); createError.value = ''; credentials.value = null; createVisible.value = true }
function closeCreate() { if (createSaving.value) return; createVisible.value = false; createForm.value.password = ''; credentials.value = null; createOperation.value = ''; createError.value = '' }
async function createUser() {
  if (createSaving.value || credentials.value) return
  const form = { ...createForm.value }, requestingUser = auth.currentUserId
  if (!enabledPlans.value.some(plan => plan.id === form.plan_id)) { createError.value = '请先创建并选择启用中的套餐'; return }
  if ((form.duration_days && (!Number.isSafeInteger(form.duration_days) || form.duration_days < 0)) || (form.tokens && (!Number.isSafeInteger(form.tokens) || form.tokens < 0))) { createError.value = '天数和额度请填写非负整数，留空或 0 使用套餐默认值'; return }
  if (form.questions !== '' && (!Number.isSafeInteger(form.questions) || Number(form.questions) < 0)) { createError.value = '问答上限请填写非负整数，留空使用套餐默认值，0 表示不限条数'; return }
  if (form.images !== '' && (!Number.isSafeInteger(form.images) || Number(form.images) < 0)) { createError.value = '图片张数请填写非负整数，留空使用套餐默认值，0 表示不赠送图片'; return }
  createSaving.value = true; createError.value = ''
  try {
    const result = await fireMembershipApi.createUser({ operation_id: createOperation.value, ...(form.username.trim() ? { username: form.username.trim() } : {}), ...(form.email.trim() ? { email: form.email.trim() } : {}), ...(form.password ? { password: form.password } : {}), ...(form.plan_id ? { fire_plan_id: form.plan_id } : {}), ...(form.duration_days ? { fire_duration_days: form.duration_days } : {}), ...(form.tokens ? { fire_tokens: form.tokens } : {}), ...(form.questions !== '' ? { fire_questions: Number(form.questions) } : {}), ...(form.images !== '' ? { fire_images: Number(form.images) } : {}) })
    if (requestingUser !== auth.currentUserId) return
    credentials.value = { username: result.user.username, email: result.user.email, password: result.generated_password || form.password || undefined }
    createForm.value.password = ''; void refresh(true)
  } catch (cause) { createError.value = fireError(cause) }
  finally { createSaving.value = false }
}
// Password reset is the native recovery path when a one-time create response was lost.
const resetVisible = ref(false), resetSaving = ref(false), resetError = ref(''), resetPassword = ref(''), resetComplete = ref(false)
const resetTarget = ref<{ id: string; username: string; email: string } | null>(null)
function openReset() {
  if (!auth.isSystemAdmin || !selected.value || selected.value.id === auth.currentUserId) return
  resetTarget.value = { id: selected.value.id, username: selected.value.username, email: selected.value.email }
  resetPassword.value = ''; resetError.value = ''; resetComplete.value = false; resetVisible.value = true
}
function closeReset() { if (resetSaving.value) return; resetVisible.value = false; resetTarget.value = null; resetPassword.value = ''; resetError.value = ''; resetComplete.value = false }
async function saveReset() {
  if (!auth.isSystemAdmin || !resetTarget.value || resetSaving.value || resetComplete.value) return
  const target = { ...resetTarget.value }, requestingUser = auth.currentUserId
  if (target.id === requestingUser) return
  resetSaving.value = true; resetError.value = ''
  try {
    if (!resetPassword.value) resetPassword.value = `Ty${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')}`
    const password = resetPassword.value
    if ([...password].length < 8 || [...password].length > 32 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) { resetError.value = '密码须为 8–32 位，包含英文字母和数字'; return }
    await resetUserPassword({ email: target.email, new_password: password })
    if (requestingUser === auth.currentUserId && resetVisible.value && resetTarget.value?.id === target.id) resetComplete.value = true
  } catch (cause) { if (requestingUser === auth.currentUserId) resetError.value = fireError(cause) }
  finally { resetSaving.value = false }
}
const adjustmentVisible = ref(false), adjustmentSaving = ref(false), adjustmentError = ref('')
const adjustment = ref<FireAdjustment>({ operation_id: '', kind: 'grant', plan_id: '', duration_days: undefined, tokens: undefined, questions: undefined, question_limit: undefined, note: '' })
const adjustmentKinds = [{ value: 'grant', label: '开通套餐' }, { value: 'renew', label: '续期套餐' }, { value: 'topup', label: '追加额度' }, { value: 'set_question_limit', label: '设置问答上限' }, { value: 'set_image_limit', label: '设置图片额度' }, { value: 'extend', label: '延长天数' }, { value: 'suspend', label: '暂停使用' }, { value: 'resume', label: '恢复使用' }]
const usesPlan = computed(() => adjustment.value.kind === 'grant' || adjustment.value.kind === 'renew')
function openAdjustment() { adjustment.value = { operation_id: generateUUID(), kind: 'grant', plan_id: enabledPlans.value[0]?.id || '', duration_days: undefined, tokens: undefined, questions: undefined, question_limit: undefined, note: '' }; adjustmentError.value = ''; adjustmentVisible.value = true }
const imageStatusLabel = { reserved: '预占中', unknown: '结果待核实', succeeded: '已交付', failed: '已释放' }
function openImageResolution(call: FireImageCall, outcome: 'succeeded' | 'failed') {
  if (!auth.isSystemAdmin || !['reserved', 'unknown'].includes(call.status)) return
  adjustment.value = { operation_id: generateUUID(), kind: 'resolve_image', image_task_id: call.task_id, image_outcome: outcome, note: '' }
  adjustmentError.value = ''; adjustmentVisible.value = true
}
async function saveAdjustment() {
  if (!auth.isSystemAdmin || !selected.value || adjustmentSaving.value) return
  const value = adjustment.value, target = selected.value, requestingUser = auth.currentUserId
  if (usesPlan.value && !value.plan_id) { adjustmentError.value = '请选择套餐'; return }
  const optionalPositive = (count: unknown) => count == null || count === '' || (Number.isSafeInteger(count) && Number(count) > 0)
  if (usesPlan.value && (!optionalPositive(value.tokens) || !optionalPositive(value.questions) || !optionalPositive(value.duration_days) || (value.images != null && String(value.images) !== '' && (!Number.isSafeInteger(value.images) || value.images < 0)))) { adjustmentError.value = '额度、问答条数和天数请填写正整数；图片张数可为 0，留空使用套餐默认值'; return }
  if (value.kind === 'topup') {
    const tokenCount = value.tokens == null || String(value.tokens) === '' ? 0 : value.tokens
    const questionCount = value.questions == null || String(value.questions) === '' ? 0 : value.questions
    const imageCount = value.images == null || String(value.images) === '' ? 0 : value.images
    if (!Number.isSafeInteger(imageCount) || imageCount < 0 || !Number.isSafeInteger(tokenCount) || tokenCount < 0 || !Number.isSafeInteger(questionCount) || questionCount < 0 || (tokenCount === 0 && questionCount === 0 && imageCount === 0)) { adjustmentError.value = 'Token、问答条数或图片张数至少填写一个正整数'; return }
  }
  if (value.kind === 'extend' && (!Number.isSafeInteger(value.duration_days) || Number(value.duration_days) <= 0)) { adjustmentError.value = '请填写正整数天数'; return }
  if (value.kind === 'set_question_limit') {
    if (!Number.isSafeInteger(value.question_limit) || Number(value.question_limit) < 0) { adjustmentError.value = '问答上限请填写非负整数，0 表示不限条数'; return }
    const used = Number(detailMembership.value?.used_questions || 0), reserved = Number(detailMembership.value?.reserved_questions || 0)
    if (Number(value.question_limit) > 0 && Number(value.question_limit) < used + reserved) { adjustmentError.value = '问答上限不能低于已用和预占问答的合计'; return }
  }
  if (value.kind === 'set_image_limit') {
    if (!Number.isSafeInteger(value.image_limit) || Number(value.image_limit) < 0) { adjustmentError.value = '图片总额度请填写非负整数，0 表示不赠送图片'; return }
    const committed = Number(detailMembership.value?.used_images || 0) + Number(detailMembership.value?.reserved_images || 0)
    if (Number(value.image_limit) < committed) { adjustmentError.value = '图片总额度不能低于已用和预占图片的合计'; return }
  }
  if (value.kind === 'resolve_image' && (!detail.value?.image_calls?.some(call => call.task_id === value.image_task_id && (call.status === 'reserved' || call.status === 'unknown')) || !['succeeded', 'failed'].includes(value.image_outcome || '') || !value.note?.trim())) { adjustmentError.value = '请核对待处理图片任务并填写处理备注'; return }
  const payload: FireAdjustment = {
    operation_id: value.operation_id, kind: value.kind,
    ...(usesPlan.value ? { plan_id: value.plan_id } : {}),
    ...((usesPlan.value || value.kind === 'extend') && value.duration_days ? { duration_days: value.duration_days } : {}),
    ...(value.kind === 'topup' ? { tokens: Number(value.tokens) || 0 } : usesPlan.value && value.tokens ? { tokens: value.tokens } : {}),
    ...((usesPlan.value || value.kind === 'topup') && value.questions ? { questions: value.questions } : {}),
    ...((usesPlan.value && value.images != null && String(value.images) !== '') || (value.kind === 'topup' && value.images) ? { images: Number(value.images) } : {}),
    ...(value.kind === 'set_image_limit' ? { image_limit: value.image_limit } : {}),
    ...(value.kind === 'resolve_image' ? { image_task_id: value.image_task_id, image_outcome: value.image_outcome } : {}),
    ...(value.kind === 'set_question_limit' ? { question_limit: value.question_limit } : {}),
    ...(value.note?.trim() ? { note: value.note.trim() } : {}),
  }
  adjustmentSaving.value = true; adjustmentError.value = ''
  try { await fireMembershipApi.adjust(target.id, payload); if (requestingUser !== auth.currentUserId) return; adjustmentVisible.value = false; window.dispatchEvent(new Event('fire-membership-updated')); await Promise.all([openUser(target), refresh(true)]) }
  catch (cause) { if (requestingUser === auth.currentUserId) adjustmentError.value = fireError(cause) }
  finally { adjustmentSaving.value = false }
}
watch(() => auth.currentUserId, () => { usersGeneration += 1; detailGeneration += 1; metaGeneration += 1; metaPending = null; refreshPending = null; plans.value = []; overview.value = null; plansLoaded.value = false; plansLoading.value = false; overviewLoading.value = false; plansError.value = ''; overviewError.value = ''; users.value = []; detail.value = null; selected.value = null; drawer.value = false; credentials.value = null; createForm.value.password = ''; createVisible.value = false; adjustmentVisible.value = false; resetVisible.value = false; resetTarget.value = null; resetPassword.value = ''; resetComplete.value = false; resetError.value = ''; if (auth.isSystemAdmin) void refresh() })
onMounted(() => { if (auth.isSystemAdmin) void refresh() })
</script>

<template>
  <main class="fire-management">
    <template v-if="auth.isSystemAdmin">
      <header class="fire-management__header"><div><p class="fire-management__eyebrow">火种 / 管理</p><h1>会员管理</h1><p>管理用户、套餐与使用额度。</p></div><div class="fire-management__actions"><t-button variant="outline" :loading="loading || plansLoading || overviewLoading" @click="refresh()">刷新</t-button><t-button theme="primary" :disabled="plansLoading || !!plansError" @click="openCreate">新建账号</t-button></div></header>
      <p v-if="overviewError" class="fire-management__error" role="alert">{{ overviewError }} <button type="button" :disabled="overviewLoading" @click="loadMeta()">重试概览</button></p>
      <p v-else-if="overviewLoading && !overview" role="status">正在读取概览…</p>
      <section v-if="overview" class="fire-management__metrics" aria-label="会员概览"><article><span>全部用户</span><strong>{{ overview.users_total }}</strong></article><article><span>有效会员</span><strong>{{ overview.active_users }}</strong></article><article><span>已到期</span><strong>{{ overview.expired_users }}</strong></article><article><span>累计 Token</span><strong>{{ tokens(overview.total_tokens) }}</strong></article></section>
      <t-tabs v-model="tab"><t-tab-panel value="users" label="用户"><div class="fire-management__toolbar"><form @submit.prevent="page = 1; loadUsers()"><t-input v-model="query" placeholder="搜索用户名或邮箱" aria-label="搜索用户" clearable /><t-button type="submit" variant="outline">搜索</t-button></form><span>{{ total }} 位用户</span></div>
        <p v-if="error" class="fire-management__error" role="alert">{{ error }} <button type="button" @click="loadUsers">重试</button></p>
        <div class="fire-management__table"><t-table row-key="id" :data="users" :columns="columns" :loading="loading" hover @row-click="({ row }: { row: FireUser }) => openUser(row)"><template #identity="{ row }"><div class="fire-management__identity"><strong>{{ row.username }}</strong><span>{{ row.email }}</span></div></template><template #plan="{ row }">{{ row.is_system_admin ? '管理账户' : row.membership?.plan_name || '未开通会员' }}</template><template #status="{ row }"><t-tag variant="light" :theme="row.is_system_admin || row.membership?.status === 'active' ? 'success' : 'warning'">{{ row.is_system_admin ? '管理员' : membershipStatusLabel[row.membership?.status as keyof typeof membershipStatusLabel] || '状态未知' }}</t-tag></template><template #balance="{ row }">{{ row.is_system_admin || row.membership?.unlimited ? '不限额度' : tokens(row.membership?.remaining_tokens) }}</template><template #expiry="{ row }">{{ row.is_system_admin ? '—' : date(row.membership?.expires_at) }}</template><template #operation="{ row }"><t-button variant="text" size="small" @click.stop="openUser(row)">详情</t-button></template></t-table></div>
        <t-pagination v-if="total > 20" v-model="page" :total="total" :page-size="20" :show-page-size="false" @current-change="loadUsers" />
      </t-tab-panel><t-tab-panel value="plans" label="套餐"><div class="fire-management__toolbar"><p>修改套餐默认值不会重写已有会员额度。用量或问答条数任一达到上限后停止生成。</p><t-button theme="primary" @click="openPlan()">新建套餐</t-button></div><p v-if="plansError" class="fire-management__error" role="alert">{{ plansError }} <button type="button" :disabled="plansLoading" @click="loadMeta()">重试套餐</button></p><div class="fire-management__plans" :aria-busy="plansLoading"><article v-for="plan in plans" :key="plan.id"><div><h2>{{ plan.name }}</h2><t-tag :theme="plan.active ? 'success' : 'default'" variant="light">{{ plan.active ? '启用' : '停用' }}</t-tag></div><strong>{{ tokens(plan.token_limit) }} <small>Token</small></strong><p>{{ plan.duration_days }} 天</p><p>{{ plan.question_limit ? `${tokens(plan.question_limit)} 条问答` : '不限问答条数' }}</p><p>{{ tokens(plan.image_limit ?? 0) }} 张图片</p><t-button variant="outline" @click="openPlan(plan)">编辑套餐</t-button></article><p v-if="!plans.length && !plansError && !plansLoaded" role="status">正在读取套餐…</p><p v-else-if="!plans.length && !plansError">暂无套餐，请先创建。</p></div></t-tab-panel></t-tabs>
      <t-drawer v-model:visible="drawer" :header="selected?.username || '用户详情'" :footer="false" size="min(760px, 100vw)" :close-btn="true"><template v-if="selected"><div class="fire-management__drawer-heading"><div><h2>{{ selected.username }}</h2><p>{{ selected.email }}</p></div><div class="fire-management__actions"><t-button v-if="selected.id !== auth.currentUserId" variant="outline" @click="openReset">重置密码</t-button><t-button v-if="!selected.is_system_admin" theme="primary" :disabled="detailLoading || !!detailError" @click="openAdjustment">调整会员</t-button></div></div><p v-if="detailLoading" role="status">正在读取详情…</p><p v-if="detailError" class="fire-management__error" role="alert">{{ detailError }} <button type="button" @click="openUser(selected)">重试</button></p><template v-if="detail && detailMembership"><dl class="fire-management__definition"><div><dt>套餐</dt><dd>{{ selected.is_system_admin ? '管理账户' : detailMembership.plan_name || '未开通' }}</dd></div><div><dt>状态</dt><dd>{{ selected.is_system_admin ? '管理员' : membershipStatusLabel[detailMembership.status] }}</dd></div><div><dt>剩余 Token</dt><dd>{{ detailMembership.unlimited ? '不限额度' : tokens(detailMembership.remaining_tokens) }}</dd></div><div><dt>已用 Token</dt><dd>{{ tokens(detailMembership.used_tokens) }}</dd></div><div><dt>到期</dt><dd>{{ date(detailMembership.expires_at) }}</dd></div><div><dt>预占 Token</dt><dd>{{ tokens(detailMembership.reserved_tokens) }}</dd></div><div><dt>问答总上限</dt><dd>{{ Number(detailMembership.question_limit) > 0 ? tokens(detailMembership.question_limit) : '不限条数' }}</dd></div><div><dt>已用问答</dt><dd>{{ tokens(detailMembership.used_questions ?? 0) }}</dd></div><div><dt>剩余问答</dt><dd>{{ Number(detailMembership.question_limit) > 0 ? tokens(detailMembership.remaining_questions) : '不限条数' }}</dd></div><div><dt>预占问答</dt><dd>{{ tokens(detailMembership.reserved_questions ?? 0) }}</dd></div><div><dt>图片总额度</dt><dd>{{ tokens(detailMembership.image_limit ?? 0) }}</dd></div><div><dt>已用图片</dt><dd>{{ tokens(detailMembership.used_images ?? 0) }}</dd></div><div><dt>剩余图片</dt><dd>{{ tokens(detailMembership.remaining_images ?? 0) }}</dd></div><div><dt>预占图片</dt><dd>{{ tokens(detailMembership.reserved_images ?? 0) }}</dd></div></dl>
          <h3>图片任务</h3><p>结果待核实的任务会保留额度。核对实际交付后再确认结算或释放，不会重新生成图片。</p>
          <div class="fire-management__image-calls"><article v-for="call in detail.image_calls || []" :key="call.id"><div><strong>{{ imageStatusLabel[call.status] || '状态未知' }}</strong><span>{{ date(call.created_at) }}</span></div><p>{{ call.task_id }}</p><div v-if="call.status === 'reserved' || call.status === 'unknown'" class="fire-management__actions"><t-button size="small" variant="outline" @click="openImageResolution(call, 'succeeded')">确认已交付</t-button><t-button size="small" variant="outline" @click="openImageResolution(call, 'failed')">确认失败释放</t-button></div></article><p v-if="!detail.image_calls?.length">暂无图片任务</p></div>
          <h3>用量明细</h3><FireUsageTable :items="detail.usage || []" /><h3>调整记录</h3><div class="fire-management__adjustments"><article v-for="(item, index) in detail.adjustments || []" :key="item.operation_id || index"><strong>{{ item.kind === 'resolve_image' ? '核实图片任务' : adjustmentKinds.find(kind => kind.value === item.kind)?.label || item.kind }}</strong><span>{{ date(item.created_at) }}</span><p>{{ item.note || '无备注' }}</p></article><p v-if="!detail.adjustments?.length">暂无调整记录</p></div></template></template></t-drawer>
      <t-dialog role="dialog" aria-modal="true" :aria-label="editingPlanId ? '编辑套餐' : '新建套餐'" v-model:visible="planVisible" :header="editingPlanId ? '编辑套餐' : '新建套餐'" :footer="false" width="min(520px, 94vw)" :close-on-overlay-click="!planSaving" :close-on-esc-keydown="!planSaving" :close-btn="!planSaving"><form class="fire-management__form" @submit.prevent="savePlan"><label>套餐名称<input v-model="planForm.name" required maxlength="100" aria-label="套餐名称" :disabled="planSaving" /></label><label>有效天数<input v-model.number="planForm.duration_days" type="number" min="1" step="1" required aria-label="套餐天数" :disabled="planSaving" /></label><label>Token 额度<input v-model.number="planForm.token_limit" type="number" min="1" step="1" required aria-label="套餐 Token" :disabled="planSaving" /></label><label>问答条数上限（0 不限）<input v-model.number="planForm.question_limit" type="number" min="0" step="1" required aria-label="套餐问答上限" :disabled="planSaving" /></label><label>图片张数（0 不赠送）<input v-model.number="planForm.image_limit" type="number" min="0" step="1" required aria-label="套餐图片张数" :disabled="planSaving" /></label><label class="fire-management__check"><input v-model="planForm.active" type="checkbox" :disabled="planSaving" />启用套餐</label><p v-if="planError" role="alert" class="fire-management__error">{{ planError }}</p><footer><t-button :disabled="planSaving" @click="planVisible = false">取消</t-button><t-button type="submit" theme="primary" :loading="planSaving">保存套餐</t-button></footer></form></t-dialog>
      <t-dialog role="dialog" aria-modal="true" aria-label="新建账号" :visible="createVisible" header="新建账号" :footer="false" width="min(560px, 94vw)" :close-on-overlay-click="!createSaving" :close-on-esc-keydown="!createSaving" :close-btn="!createSaving" @close="closeCreate"><template v-if="credentials"><p class="fire-management__credential-notice">账号已创建。请现在保存登录信息；密码关闭后不再显示。</p><dl class="fire-management__definition fire-management__credentials"><div><dt>用户名</dt><dd>{{ credentials.username }}</dd></div><div><dt>邮箱</dt><dd>{{ credentials.email }}</dd></div><div><dt>密码</dt><dd data-testid="generated-password">{{ credentials.password || '重试已找回账号；密码仅首次创建时返回。请关闭后在用户详情重置密码。' }}</dd></div></dl><t-button theme="primary" @click="closeCreate">我已保存，关闭</t-button></template><form v-else class="fire-management__form" @submit.prevent="createUser"><p>可留空用户名、邮箱和密码，系统将自动生成。</p><p v-if="!enabledPlans.length" class="fire-management__error">暂无可用套餐，请先新增并启用套餐。</p><label>用户名<input v-model="createForm.username" aria-label="新账号用户名" autocomplete="off" :disabled="createSaving" /></label><label>邮箱<input v-model="createForm.email" type="email" aria-label="新账号邮箱" autocomplete="off" :disabled="createSaving" /></label><label>密码<input v-model="createForm.password" type="password" aria-label="新账号密码" autocomplete="new-password" :disabled="createSaving" /></label><label>套餐<select v-model="createForm.plan_id" aria-label="新账号套餐" :disabled="createSaving"><option value="">请选择套餐</option><option v-for="plan in enabledPlans" :key="plan.id" :value="plan.id">{{ plan.name }}</option></select></label><div class="fire-management__form-grid"><label>天数覆盖（0 使用默认）<input v-model.number="createForm.duration_days" type="number" min="0" step="1" aria-label="新账号天数" :disabled="createSaving" /></label><label>Token 覆盖（0 使用默认）<input v-model.number="createForm.tokens" type="number" min="0" step="1" aria-label="新账号 Token" :disabled="createSaving" /></label></div><label>问答上限覆盖（留空使用默认，0 不限）<input v-model.number="createForm.questions" type="number" min="0" step="1" aria-label="新账号问答上限" :placeholder="String(createPlan?.question_limit || 0)" :disabled="createSaving" /></label><label>图片张数覆盖（留空使用默认，0 不赠送）<input v-model.number="createForm.images" type="number" min="0" step="1" aria-label="新账号图片张数" :placeholder="String(createPlan?.image_limit || 0)" :disabled="createSaving" /></label><p v-if="createPlan">套餐图片：{{ tokens(createPlan.image_limit ?? 0) }} 张图片</p><p v-if="createPlan">套餐默认：{{ createPlan.question_limit ? `${tokens(createPlan.question_limit)} 条问答` : '不限问答条数' }}</p><p v-if="createError" role="alert" class="fire-management__error">{{ createError }}；可原样重试。</p><footer><t-button :disabled="createSaving" @click="closeCreate">取消</t-button><t-button type="submit" theme="primary" :loading="createSaving" :disabled="!enabledPlans.length">创建账号</t-button></footer></form></t-dialog>
      <t-dialog role="dialog" aria-modal="true" aria-label="重置密码" :visible="resetVisible" header="重置密码" :footer="false" width="min(520px, 94vw)" :close-on-overlay-click="!resetSaving" :close-on-esc-keydown="!resetSaving" :close-btn="!resetSaving" @close="closeReset"><template v-if="resetComplete && resetTarget"><p>密码已重置。请现在保存登录信息；关闭后不再显示。</p><dl class="fire-management__definition fire-management__credentials"><div><dt>用户名</dt><dd>{{ resetTarget.username }}</dd></div><div><dt>邮箱</dt><dd>{{ resetTarget.email }}</dd></div><div><dt>密码</dt><dd data-testid="reset-password">{{ resetPassword }}</dd></div></dl><t-button theme="primary" @click="closeReset">我已保存，关闭</t-button></template><form v-else class="fire-management__form" @submit.prevent="saveReset"><p>为 {{ resetTarget?.email }} 重置密码，已有登录将失效。留空自动生成 Ty 加 6 位数字的密码。</p><label>新密码<input v-model="resetPassword" type="password" aria-label="重置后的密码" autocomplete="new-password" maxlength="32" :disabled="resetSaving" /></label><p>自定义密码须为 8–32 位，包含英文字母和数字。</p><p v-if="resetError" role="alert" class="fire-management__error">{{ resetError }}；可原样重试。</p><footer><t-button :disabled="resetSaving" @click="closeReset">取消</t-button><t-button type="submit" theme="primary" :loading="resetSaving">确认重置</t-button></footer></form></t-dialog>
      <t-dialog role="dialog" aria-modal="true" aria-label="调整会员" v-model:visible="adjustmentVisible" :header="`调整会员 · ${selected?.username || ''}`" :footer="false" width="min(520px, 94vw)" :close-on-overlay-click="!adjustmentSaving" :close-on-esc-keydown="!adjustmentSaving" :close-btn="!adjustmentSaving"><form class="fire-management__form" @submit.prevent="saveAdjustment"><label v-if="adjustment.kind !== 'resolve_image'">操作<select v-model="adjustment.kind" aria-label="会员操作" :disabled="adjustmentSaving"><option v-for="kind in adjustmentKinds" :key="kind.value" :value="kind.value">{{ kind.label }}</option></select></label><label v-if="usesPlan">套餐<select v-model="adjustment.plan_id" aria-label="调整套餐" :disabled="adjustmentSaving"><option value="">请选择</option><option v-for="plan in enabledPlans" :key="plan.id" :value="plan.id">{{ plan.name }}</option></select></label><label v-if="usesPlan || adjustment.kind === 'extend'">天数{{ usesPlan ? '（留空使用默认）' : '' }}<input v-model.number="adjustment.duration_days" type="number" min="1" step="1" aria-label="调整天数" :disabled="adjustmentSaving" /></label><label v-if="usesPlan || adjustment.kind === 'topup'">Token{{ usesPlan ? '（留空使用默认）' : '' }}<input v-model.number="adjustment.tokens" type="number" :min="adjustment.kind === 'topup' ? 0 : 1" step="1" aria-label="调整 Token" :disabled="adjustmentSaving" /></label><label v-if="usesPlan || adjustment.kind === 'topup'">问答条数{{ usesPlan ? '（留空使用套餐默认值）' : '（留空不追加）' }}<input v-model.number="adjustment.questions" type="number" min="1" step="1" aria-label="调整问答条数" :disabled="adjustmentSaving" /></label><label v-if="usesPlan || adjustment.kind === 'topup'">图片张数{{ usesPlan ? '（留空使用套餐默认值，0 不赠送）' : '（留空不追加）' }}<input v-model.number="adjustment.images" type="number" min="0" step="1" aria-label="调整图片张数" :disabled="adjustmentSaving" /></label><template v-if="adjustment.kind === 'set_image_limit'"><label>图片累计总额度（0 不赠送）<input v-model.number="adjustment.image_limit" type="number" min="0" step="1" required aria-label="用户图片总额度" :disabled="adjustmentSaving" /></label><p>不得低于已用与预占图片的合计；设置不会重置已用张数。</p></template><template v-if="adjustment.kind === 'resolve_image'"><p>任务：{{ adjustment.image_task_id }}</p><p>{{ adjustment.image_outcome === 'succeeded' ? '确认图片已经交付后，将预占张数计入已用额度。' : '确认生成失败且未交付后，将释放该任务预占的图片额度。' }}此操作不会重新生成图片。</p></template><template v-if="adjustment.kind === 'set_question_limit'"><label>问答总上限（0 取消限制）<input v-model.number="adjustment.question_limit" type="number" min="0" step="1" required aria-label="用户问答总上限" :disabled="adjustmentSaving" /></label><p>设置累计总上限，已用与预占条数不清零。</p></template><label>备注<textarea v-model="adjustment.note" rows="3" maxlength="1000" aria-label="调整备注" :disabled="adjustmentSaving" /></label><p v-if="adjustmentError" role="alert" class="fire-management__error">{{ adjustmentError }}；可原样重试。</p><footer><t-button :disabled="adjustmentSaving" @click="adjustmentVisible = false">取消</t-button><t-button type="submit" theme="primary" :loading="adjustmentSaving">确认调整</t-button></footer></form></t-dialog>
    </template><p v-else role="alert">仅系统管理员可使用会员管理。</p>
  </main>
</template>

<style scoped>
/* Existing operations page/table/drawer structure, scoped to the Fire app and its native theme. */
.fire-management { flex: 1; min-width: 0; overflow: auto; padding: 36px clamp(20px, 4vw, 56px) 60px; color: var(--fire-text, #17212f); background: var(--fire-canvas, #fff); }
.fire-management__header, .fire-management__actions, .fire-management__toolbar, .fire-management__drawer-heading { display: flex; justify-content: space-between; align-items: start; gap: 14px; }
.fire-management__header { margin-bottom: 28px; } h1 { margin: 8px 0 10px; font-size: 28px; font-weight: 600; letter-spacing: -.025em; } h2 { font-size: 17px; font-weight: 600; } h3 { margin: 28px 0 14px; font-size: 15px; font-weight: 600; } p { font-size: 12px; line-height: 1.7; color: var(--fire-muted, #6b7280); } .fire-management__eyebrow { margin: 0; letter-spacing: .05em; font-size: 11px; }
.fire-management__actions { align-items: center; padding-top: 6px; flex-wrap: wrap; }
.fire-management__metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px; } .fire-management__metrics article { padding: 20px; border: 1px solid var(--fire-line, #e5e7eb); border-radius: 12px; background: var(--fire-surface, #fff); min-width: 0; } .fire-management__metrics span { color: var(--fire-muted, #6b7280); font-size: 11px; } .fire-management__metrics strong { display: block; margin-top: 12px; font-size: 25px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.fire-management__toolbar { align-items: center; margin: 22px 0 18px; font-size: 12px; color: var(--fire-muted, #6b7280); } .fire-management__toolbar form { display: flex; width: min(450px, 100%); gap: 10px; } .fire-management__table { overflow-x: auto; border: 1px solid var(--fire-line, #e5e7eb); border-radius: 12px; }
.fire-management__identity { display: grid; gap: 4px; } .fire-management__identity strong { font-weight: 550; } .fire-management__identity span { font-size: 11px; color: var(--fire-muted, #6b7280); }
.fire-management__plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; } .fire-management__plans article { padding: 24px; border: 1px solid var(--fire-line, #e5e7eb); border-radius: 12px; background: var(--fire-surface, #fff); } .fire-management__plans article > div { display: flex; align-items: center; justify-content: space-between; gap: 10px; } .fire-management__plans h2 { margin: 0 0 18px; } .fire-management__plans strong { font-size: 23px; font-weight: 600; overflow-wrap: anywhere; } .fire-management__plans small { font-size: 11px; color: var(--fire-muted, #6b7280); }
.fire-management__definition { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px 0; border-top: 1px solid var(--fire-line, #e5e7eb); border-bottom: 1px solid var(--fire-line, #e5e7eb); } dt { color: var(--fire-muted, #6b7280); font-size: 11px; } dd { margin: 7px 0 0; font-size: 14px; overflow-wrap: anywhere; } .fire-management__credentials { grid-template-columns: 1fr; } .fire-management__credentials dd { user-select: all; font-family: var(--app-font-family-mono, monospace); }
.fire-management__image-calls article { padding: 16px 0; border-bottom: 1px solid var(--fire-line, #e5e7eb); } .fire-management__image-calls article > div:first-child { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; } .fire-management__image-calls article p { overflow-wrap: anywhere; }
.fire-management__adjustments article { border-bottom: 1px solid var(--fire-line, #e5e7eb); padding: 14px 0; font-size: 12px; } .fire-management__adjustments article > span { float: right; color: var(--fire-muted, #6b7280); } .fire-management__adjustments p { margin-bottom: 0; }
.fire-management__form { display: grid; gap: 16px; max-height: calc(100dvh - 180px); overflow-y: auto; padding: 2px; } .fire-management__form > p { margin: 0; } .fire-management__form label { display: grid; gap: 7px; color: var(--fire-text, #17212f); font-size: 12px; } .fire-management__form input:not([type=checkbox]), .fire-management__form select, .fire-management__form textarea { box-sizing: border-box; width: 100%; min-height: 36px; padding: 8px 10px; border: 1px solid var(--fire-line, #d1d5db); border-radius: 7px; color: var(--fire-text, #17212f); background: var(--fire-surface, #fff); font: inherit; } .fire-management__form input:focus, .fire-management__form select:focus, .fire-management__form textarea:focus { outline: 2px solid var(--fire-link, #d62642); outline-offset: 1px; } .fire-management__form .fire-management__check { display: flex; align-items: center; gap: 8px; } .fire-management__form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .fire-management__form footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.fire-management__error { color: var(--fire-link, #b7233b); font-size: 12px; } .fire-management__error button { border: 0; padding: 2px; background: transparent; color: inherit; cursor: pointer; text-decoration: underline; } :deep(.t-pagination) { margin-top: 18px; }
@media(max-width: 800px) { .fire-management__metrics { grid-template-columns: 1fr 1fr; } .fire-management__header, .fire-management__toolbar { flex-wrap: wrap; } .fire-management__metrics strong { font-size: 21px; } }
@media(max-width: 480px) { .fire-management__definition, .fire-management__form-grid { grid-template-columns: 1fr; } }
</style>
