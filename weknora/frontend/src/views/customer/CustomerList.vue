<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { listKnowledgeBases } from '@/api/knowledge-base'
import { changeCustomerTags, deleteCustomer, getCustomerConfig, type CustomerConfig } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue'
import CustomerTags from './CustomerTags.vue'
import { customerVisibleNote, customerVisibleTags } from './customerPresentation'
const router = useRouter(), authStore = useAuthStore()
const customers = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const selectedTags = ref<string[]>([])
const showCreate = ref(false)
const selectedIds = ref(new Set<string>())
const showBatchEdit = ref(false), showDelete = ref(false)
const batchMode = ref<'add' | 'remove'>('add'), batchTags = ref<string[]>([])
const savingBatch = ref(false), deleting = ref(false), actionError = ref('')
const deleteTargets = ref<any[]>([])
const mutating = computed(() => savingBatch.value || deleting.value)
const config = ref<CustomerConfig>({ statuses: [], tags: [], templates: [] })
const tags = computed(() => [...new Set([...config.value.tags, ...customers.value.flatMap(c => customerVisibleTags(c.customer_profile))])])
const visible = computed(() => customers.value.filter(c =>
  (selectedTags.value || []).every(tag => customerVisibleTags(c.customer_profile).includes(tag)) &&
  `${c.name} ${customerVisibleNote(c.customer_profile.note, c.description)} ${c.customer_profile.contact} ${customerVisibleTags(c.customer_profile).join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase()),
))
// Match the native KB creator/admin rule; the API remains the authorization authority.
function canManage(customer: any) {
  return authStore.hasRole('contributor') && String(customer.tenant_id) === String(authStore.effectiveTenantId)
    && (authStore.hasRole('admin') || (!!customer.creator_id && customer.creator_id === authStore.user?.id))
}
const selectable = computed(() => visible.value.filter(canManage))
const selectedCustomers = computed(() => selectable.value.filter(customer => selectedIds.value.has(customer.id)))
const allSelected = computed(() => selectable.value.length > 0 && selectedCustomers.value.length === selectable.value.length)
const partlySelected = computed(() => selectedCustomers.value.length > 0 && !allSelected.value)
const deleteNames = computed(() => deleteTargets.value.map(customer => customer.name).join('、'))
watch(selectable, rows => {
  const allowed = new Set(rows.map(customer => customer.id))
  selectedIds.value = new Set([...selectedIds.value].filter(id => allowed.has(id)))
})
function selectCustomer(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id); else next.delete(id)
  selectedIds.value = next
}
function selectAll(checked: boolean) {
  selectedIds.value = new Set(checked ? selectable.value.map(customer => customer.id) : [])
}
let loadVersion = 0
async function load() {
  const version = ++loadVersion
  loading.value = true; error.value = ''
  try {
    const [res, choices] = await Promise.allSettled([listKnowledgeBases(), getCustomerConfig()])
    if (version !== loadVersion) return
    if (res.status === 'rejected') throw res.reason
    customers.value = ((res.value as any).data || []).filter((kb: any) => kb.customer_profile)
    if (choices.status === 'fulfilled') config.value = choices.value
  }
  catch (e: any) { if (version === loadVersion) error.value = e.message || '客户列表加载失败' }
  finally { if (version === loadVersion) loading.value = false }
}
function clearFilters() { search.value = ''; selectedTags.value = [] }
function openCreate() { showCreate.value = true }
function openBatchEdit() { batchMode.value = 'add'; batchTags.value = []; actionError.value = ''; showBatchEdit.value = true }
function createBatchTag(value: string) {
  const tag = value.trim()
  if (!tag || batchTags.value.includes(tag)) return
  if (new TextEncoder().encode(tag).length > 100 || batchTags.value.length >= 30) return MessagePlugin.warning('客户标签最多 30 个，单个标签请缩短')
  batchTags.value = [...batchTags.value, tag]
}
async function saveBatchTags() {
  if (mutating.value || !selectedCustomers.value.length) return
  const labels = batchTags.value.map(tag => tag.trim()).filter(Boolean)
  if (!labels.length) return MessagePlugin.warning('请至少选择一个标签')
  const targets = [...selectedCustomers.value], mode = batchMode.value
  savingBatch.value = true; actionError.value = ''
  const failed: any[] = [], failures: string[] = []
  for (const customer of targets) {
    try { await changeCustomerTags(customer.id, mode, labels) }
    catch (e: any) { failed.push(customer); failures.push(`${customer.name}：${e.message || '保存失败'}`) }
  }
  selectedIds.value = new Set(failed.map(customer => customer.id))
  await load()
  savingBatch.value = false
  if (failures.length) {
    actionError.value = failures.join('；')
    MessagePlugin.warning(`已更新 ${targets.length - failed.length} 位客户，${failed.length} 位未完成，可重试`)
  } else {
    showBatchEdit.value = false
    MessagePlugin.success(`已更新 ${targets.length} 位客户的标签`)
  }
}
function requestDelete(targets: any[]) {
  deleteTargets.value = targets.filter(canManage)
  if (!deleteTargets.value.length) return
  actionError.value = ''; showDelete.value = true
}
async function confirmDelete() {
  if (mutating.value || !deleteTargets.value.length) return
  deleting.value = true; actionError.value = ''
  const targets = [...deleteTargets.value], failed: any[] = [], failures: string[] = []
  for (const customer of targets) {
    try { await deleteCustomer(customer.id) }
    catch (e: any) { failed.push(customer); failures.push(`${customer.name}：${e.message || '删除失败'}`) }
  }
  const deletedIds = new Set(targets.filter(customer => !failed.some(item => item.id === customer.id)).map(customer => customer.id))
  selectedIds.value = new Set([...selectedIds.value].filter(id => !deletedIds.has(id)))
  deleteTargets.value = failed
  await load()
  deleting.value = false
  if (failures.length) {
    actionError.value = failures.join('；')
    MessagePlugin.warning(`已删除 ${targets.length - failed.length} 位客户，${failed.length} 位未完成，可重试`)
  } else {
    showDelete.value = false
    MessagePlugin.success(`已删除 ${targets.length} 位客户`)
  }
}
const date = (value: string) => value ? new Date(value).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit'}) : '—'
onMounted(load)
</script>
<template>
  <main class="customer-page customer-list" :aria-busy="loading || mutating">
    <header class="workspace-list-header"><h1><t-icon name="usergroup"/>客户</h1><button v-if="authStore.hasRole('contributor')" class="customer-primary" :disabled="mutating" @click="openCreate"><t-icon name="add"/>新建客户</button></header>
    <div class="customer-filters"><t-input v-model="search" clearable :disabled="mutating" aria-label="搜索客户" placeholder="搜索姓名、标签、备注或联系方式"><template #prefix-icon><t-icon name="search"/></template></t-input><t-select v-model="selectedTags" multiple clearable filterable :disabled="mutating" aria-label="按客户标签筛选" placeholder="按标签筛选" :options="tags.map(value=>({label:value,value}))"/><span class="customer-muted" role="status">{{visible.length}} 位客户</span><button class="customer-icon" :disabled="loading || mutating" :aria-label="loading ? '正在刷新客户' : '刷新'" @click="load"><t-loading v-if="loading" size="16px"/><t-icon v-else name="refresh"/></button></div>
    <div v-if="selectedCustomers.length" class="customer-batch-bar" role="toolbar" aria-label="批量管理客户"><span>已选 {{selectedCustomers.length}} 位客户</span><button class="customer-secondary" :disabled="mutating || loading" @click="openBatchEdit"><t-icon name="edit"/>批量编辑标签</button><button class="customer-secondary customer-danger" :disabled="mutating || loading" @click="requestDelete(selectedCustomers)"><t-icon name="delete"/>批量删除</button><button class="customer-icon" :disabled="mutating" @click="selectAll(false)">取消选择</button></div>
    <t-alert v-if="error" theme="error" :message="error"><template #operation><t-button variant="text" :disabled="loading" @click="load">重新加载</t-button></template></t-alert>
    <div v-if="loading && !customers.length" class="customer-empty"><t-loading text="正在读取客户…"/></div>
    <div v-else-if="!error && !visible.length" class="customer-empty"><t-icon name="usergroup" size="32px"/><h3>{{customers.length ? '没有符合条件的客户' : '从第一位客户开始'}}</h3><button v-if="customers.length" class="customer-secondary" @click="clearFilters">清除筛选</button><button v-else-if="authStore.hasRole('contributor')" class="customer-primary" @click="openCreate">新建客户</button></div>
    <div v-else-if="visible.length" class="customer-table-wrap"><table class="customer-table"><thead><tr><th v-if="selectable.length" class="customer-select-cell"><input type="checkbox" aria-label="选择当前列表全部可管理客户" :checked="allSelected" :indeterminate="partlySelected" :disabled="loading || mutating" @change="selectAll(($event.target as HTMLInputElement).checked)"/></th><th>客户</th><th>标签</th><th>备注</th><th>资料</th><th>最近更新</th><th>操作</th></tr></thead><tbody><tr v-for="customer in visible" :key="customer.id" :class="{'customer-row-selected':selectedIds.has(customer.id)}" @click="!mutating && router.push(`/platform/customers/${customer.id}`)"><td v-if="selectable.length" class="customer-select-cell" @click.stop><input v-if="canManage(customer)" type="checkbox" :aria-label="`选择客户 ${customer.name}`" :checked="selectedIds.has(customer.id)" :disabled="loading || mutating" @change="selectCustomer(customer.id, ($event.target as HTMLInputElement).checked)"/></td><td><router-link class="customer-name" :to="`/platform/customers/${customer.id}`" @click.stop><span><strong>{{customer.name}}</strong><small>{{customer.customer_profile.contact || '暂未填写联系方式'}}</small></span></router-link></td><td><CustomerTags :tags="customerVisibleTags(customer.customer_profile)" /></td><td><p class="customer-table-description">{{customerVisibleNote(customer.customer_profile.note, customer.description) || '还没有补充备注'}}</p></td><td>{{customer.knowledge_count || 0}} 份</td><td class="customer-muted">{{date(customer.updated_at)}}</td><td @click.stop><button v-if="canManage(customer)" class="customer-icon customer-danger customer-row-delete" :disabled="mutating || loading" :aria-label="`删除客户 ${customer.name}`" @click="requestDelete([customer])"><t-icon name="delete"/>删除</button><t-icon v-else name="chevron-right"/></td></tr></tbody></table></div>
    <t-dialog v-model:visible="showBatchEdit" :header="`批量编辑标签 · ${selectedCustomers.length} 位客户`" :confirm-btn="{content:'保存标签', loading:savingBatch}" :cancel-btn="{disabled:savingBatch}" :close-btn="!savingBatch" :close-on-overlay-click="!savingBatch" :close-on-esc-keydown="!savingBatch" @confirm="saveBatchTags"><div class="customer-form"><label>操作方式<t-select v-model="batchMode" :disabled="savingBatch" :options="[{label:'添加标签',value:'add'},{label:'移除标签',value:'remove'}]" @change="batchTags=[]"/></label><label>标签<t-select v-model="batchTags" multiple filterable clearable :creatable="batchMode==='add'" :disabled="savingBatch" :options="tags.map(value=>({label:value,value}))" :placeholder="batchMode==='add' ? '选择标签，或输入新标签后回车' : '选择要移除的标签'" @create="createBatchTag"/></label><p class="customer-muted">{{batchMode==='add' ? '只添加选中的标签，其他标签保持不变。' : '只移除选中的标签，其他标签保持不变。'}}</p><t-alert v-if="actionError" theme="error" :message="actionError"/></div></t-dialog>
    <t-dialog v-model:visible="showDelete" :header="deleteTargets.length > 1 ? '删除所选客户' : '删除客户'" theme="warning" :confirm-btn="{content:'确认删除',theme:'danger',loading:deleting}" :cancel-btn="{disabled:deleting}" :close-btn="!deleting" :close-on-overlay-click="!deleting" :close-on-esc-keydown="!deleting" @confirm="confirmDelete"><p class="customer-delete-names">将删除 {{deleteTargets.length}} 位客户：{{deleteNames}}</p><p class="customer-muted">删除后客户将从列表移除，客户资料会由系统清理。此操作不可撤回。</p><t-alert v-if="actionError" theme="error" :message="actionError"/></t-dialog>
    <KnowledgeBaseEditorModal v-model:visible="showCreate" mode="create" customer @success="id => router.push(`/platform/customers/${id}`)" />
  </main>
</template>
<style scoped>
.customer-batch-bar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px;padding:12px 16px;border:1px solid var(--td-component-stroke,#e5e7eb);border-radius:12px;background:var(--td-bg-color-container,#fff);font-size:13px}
.customer-batch-bar .customer-secondary{padding:7px 12px;font-size:13px}.customer-danger{color:var(--td-error-color,#d54941)}
.customer-table .customer-select-cell{width:36px;padding-left:18px;padding-right:0}.customer-select-cell input{width:16px;height:16px;cursor:pointer;accent-color:var(--td-brand-color,#111827)}
.customer-row-selected{background:var(--td-bg-color-secondarycontainer,#f3f5f7)}.customer-row-delete{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:13px}
.customer-delete-names{line-height:1.7;overflow-wrap:anywhere}
</style>
