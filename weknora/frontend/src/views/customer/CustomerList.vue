<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listKnowledgeBases } from '@/api/knowledge-base'
import { getCustomerConfig, type CustomerConfig } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue'
import CustomerSettingsDialog from './CustomerSettingsDialog.vue'
const router = useRouter()
const auth = useAuthStore()
const customers = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const status = ref('')
const tag = ref('')
const showCreate = ref(false)
const showSettings = ref(false)
const config = ref<CustomerConfig>({ statuses: [], tags: [], templates: [] })
const configError = ref('')
const statuses = computed(() => [...new Set([...config.value.statuses, ...customers.value.map(c => c.customer_profile.status)].filter(Boolean))])
const tags = computed(() => [...new Set([...config.value.tags, ...customers.value.flatMap(c => c.customer_profile.tags || [])])])
const visible = computed(() => customers.value.filter(c => (!status.value || c.customer_profile.status === status.value) && (!tag.value || c.customer_profile.tags?.includes(tag.value)) && `${c.name} ${c.description} ${c.customer_profile.contact} ${(c.customer_profile.tags || []).join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase())))
let loadVersion = 0
async function load() {
  const version = ++loadVersion
  loading.value = true; error.value = ''
  try {
    const [res, choices] = await Promise.allSettled([listKnowledgeBases(), getCustomerConfig()])
    if (version !== loadVersion) return
    if (res.status === 'rejected') throw res.reason
    customers.value = ((res.value as any).data || []).filter((kb: any) => kb.customer_profile)
    configError.value = choices.status === 'rejected' ? '客户选项加载失败，暂时显示已有客户使用的选项。' : ''
    if (choices.status === 'fulfilled') config.value = choices.value
  }
  catch (e: any) { if (version === loadVersion) error.value = e.message || '客户列表加载失败' }
  finally { if (version === loadVersion) loading.value = false }
}
function clearFilters() { search.value = ''; status.value = ''; tag.value = '' }
function openCreate() { showCreate.value = true }
function savedSettings(value: CustomerConfig) { config.value = value; configError.value = '' }
const date = (value: string) => value ? new Date(value).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit'}) : '—'
onMounted(load)
</script>
<template>
  <main class="customer-page customer-list" :aria-busy="loading">
    <header class="workspace-list-header"><h1><t-icon name="usergroup"/>客户</h1><div class="customer-actions"><button v-if="auth.hasRole('admin')" class="customer-secondary" @click="showSettings=true"><t-icon name="setting"/>客户设置</button><button class="customer-primary" @click="openCreate"><t-icon name="add"/>新建客户</button></div></header>
    <t-alert v-if="configError" theme="warning" :message="configError"><template #operation><t-button variant="text" @click="load">重试</t-button></template></t-alert>
    <div class="customer-filters"><t-input v-model="search" clearable aria-label="搜索客户" placeholder="搜索姓名、标签或联系方式"><template #prefix-icon><t-icon name="search"/></template></t-input><t-select v-model="status" clearable aria-label="客户状态" placeholder="全部状态" :options="statuses.map(value=>({label:value,value}))"/><t-select v-model="tag" clearable aria-label="客户标签" placeholder="全部标签" :options="tags.map(value=>({label:value,value}))"/><span class="customer-muted" role="status">{{visible.length}} 位客户</span><button class="customer-icon" :disabled="loading" :aria-label="loading ? '正在刷新客户' : '刷新'" @click="load"><t-loading v-if="loading" size="16px"/><t-icon v-else name="refresh"/></button></div>
    <t-alert v-if="error" theme="error" :message="error"><template #operation><t-button variant="text" :disabled="loading" @click="load">重新加载</t-button></template></t-alert>
    <div v-if="loading && !customers.length" class="customer-empty"><t-loading text="正在读取客户…"/></div>
    <div v-else-if="!error && !visible.length" class="customer-empty"><t-icon name="usergroup" size="32px"/><h3>{{customers.length ? '没有符合条件的客户' : '从第一位客户开始'}}</h3><button v-if="customers.length" class="customer-secondary" @click="clearFilters">清除筛选</button><button v-else class="customer-primary" @click="openCreate">新建客户</button></div>
    <div v-else-if="visible.length" class="customer-table-wrap"><table class="customer-table"><thead><tr><th>客户</th><th>状态</th><th>关注点</th><th>资料</th><th>最近更新</th><th></th></tr></thead><tbody><tr v-for="customer in visible" :key="customer.id" @click="router.push(`/platform/customers/${customer.id}`)"><td><router-link class="customer-name" :to="`/platform/customers/${customer.id}`" @click.stop><span><strong>{{customer.name}}</strong><small>{{customer.customer_profile.contact || '暂未填写联系方式'}}</small></span></router-link></td><td><span class="customer-status" :data-status="customer.customer_profile.status">{{customer.customer_profile.status || '待了解'}}</span></td><td><div class="customer-tags"><span v-for="item in customer.customer_profile.tags" :key="item">{{item}}</span></div><p class="customer-table-description">{{customer.description || '还没有补充说明'}}</p></td><td>{{customer.knowledge_count || 0}} 份</td><td class="customer-muted">{{date(customer.updated_at)}}</td><td><t-icon name="chevron-right"/></td></tr></tbody></table></div>
    <KnowledgeBaseEditorModal v-model:visible="showCreate" mode="create" customer @success="id => router.push(`/platform/customers/${id}`)" />
    <CustomerSettingsDialog v-model:visible="showSettings" @saved="savedSettings" />
  </main>
</template>
