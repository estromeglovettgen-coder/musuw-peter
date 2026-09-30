<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listKnowledgeBases } from '@/api/knowledge-base'
import { getCustomerConfig, type CustomerConfig } from '@/api/customer'
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue'
import { customerVisibleNote, customerVisibleTags } from './customerPresentation'
const router = useRouter()
const customers = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const selectedTags = ref<string[]>([])
const showCreate = ref(false)
const config = ref<CustomerConfig>({ statuses: [], tags: [], templates: [] })
const tags = computed(() => [...new Set([...config.value.tags, ...customers.value.flatMap(c => customerVisibleTags(c.customer_profile))])])
const visible = computed(() => customers.value.filter(c =>
  (selectedTags.value || []).every(tag => customerVisibleTags(c.customer_profile).includes(tag)) &&
  `${c.name} ${customerVisibleNote(c.customer_profile.note, c.description)} ${c.customer_profile.contact} ${customerVisibleTags(c.customer_profile).join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase()),
))
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
const date = (value: string) => value ? new Date(value).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit'}) : '—'
onMounted(load)
</script>
<template>
  <main class="customer-page customer-list" :aria-busy="loading">
    <header class="workspace-list-header"><h1><t-icon name="usergroup"/>客户</h1><button class="customer-primary" @click="openCreate"><t-icon name="add"/>新建客户</button></header>
    <div class="customer-filters"><t-input v-model="search" clearable aria-label="搜索客户" placeholder="搜索姓名、标签、备注或联系方式"><template #prefix-icon><t-icon name="search"/></template></t-input><t-select v-model="selectedTags" multiple clearable filterable aria-label="按客户标签筛选" placeholder="按标签筛选" :options="tags.map(value=>({label:value,value}))"/><span class="customer-muted" role="status">{{visible.length}} 位客户</span><button class="customer-icon" :disabled="loading" :aria-label="loading ? '正在刷新客户' : '刷新'" @click="load"><t-loading v-if="loading" size="16px"/><t-icon v-else name="refresh"/></button></div>
    <t-alert v-if="error" theme="error" :message="error"><template #operation><t-button variant="text" :disabled="loading" @click="load">重新加载</t-button></template></t-alert>
    <div v-if="loading && !customers.length" class="customer-empty"><t-loading text="正在读取客户…"/></div>
    <div v-else-if="!error && !visible.length" class="customer-empty"><t-icon name="usergroup" size="32px"/><h3>{{customers.length ? '没有符合条件的客户' : '从第一位客户开始'}}</h3><button v-if="customers.length" class="customer-secondary" @click="clearFilters">清除筛选</button><button v-else class="customer-primary" @click="openCreate">新建客户</button></div>
    <div v-else-if="visible.length" class="customer-table-wrap"><table class="customer-table"><thead><tr><th>客户</th><th>标签</th><th>备注</th><th>资料</th><th>最近更新</th><th></th></tr></thead><tbody><tr v-for="customer in visible" :key="customer.id" @click="router.push(`/platform/customers/${customer.id}`)"><td><router-link class="customer-name" :to="`/platform/customers/${customer.id}`" @click.stop><span><strong>{{customer.name}}</strong><small>{{customer.customer_profile.contact || '暂未填写联系方式'}}</small></span></router-link></td><td><div class="customer-tags"><span v-for="item in customerVisibleTags(customer.customer_profile)" :key="item">{{item}}</span><span v-if="!customerVisibleTags(customer.customer_profile).length">—</span></div></td><td><p class="customer-table-description">{{customerVisibleNote(customer.customer_profile.note, customer.description) || '还没有补充备注'}}</p></td><td>{{customer.knowledge_count || 0}} 份</td><td class="customer-muted">{{date(customer.updated_at)}}</td><td><t-icon name="chevron-right"/></td></tr></tbody></table></div>
    <KnowledgeBaseEditorModal v-model:visible="showCreate" mode="create" customer @success="id => router.push(`/platform/customers/${id}`)" />
  </main>
</template>
