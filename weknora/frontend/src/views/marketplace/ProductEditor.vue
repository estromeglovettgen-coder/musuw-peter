<template>
  <t-dialog :visible="true" :header="t(product ? 'creatorMarketplace.editProduct' : 'creatorMarketplace.newProduct')" width="720px" :confirm-btn="{ content: t(product ? 'creatorMarketplace.save' : 'creatorMarketplace.saveDraft'), loading: saving, disabled: loading }" :cancel-btn="t('creatorMarketplace.cancel')" :close-on-overlay-click="false" class="market-dialog" @confirm="save" @close="emit('close')">
    <div v-if="loading" class="market-empty">{{ t('common.loading') }}</div>
    <form v-else class="market-form" @submit.prevent="save">
      <p v-if="failedSources" class="market-error" role="alert">{{ t('creatorMarketplace.loadFailed') }}<t-button theme="default" @click="loadSources">{{ t('creatorMarketplace.retry') }}</t-button></p>
      <label>{{ t('creatorMarketplace.productTitle') }}<t-input v-model="form.title" :maxlength="100" /></label>
      <label>{{ t('creatorMarketplace.description') }}<t-textarea v-model="form.description" :maxlength="10000" :autosize="{ minRows: 4, maxRows: 10 }" /></label>
      <div class="market-form-grid"><label>{{ t('creatorMarketplace.category') }}<t-input v-model="form.category" :maxlength="50" /></label><label>{{ t('creatorMarketplace.coverUrl') }}<t-input v-model="form.cover_url" placeholder="https://" /></label></div>
      <label>{{ t('creatorMarketplace.agent') }}<t-select v-model="form.agent_id" filterable :placeholder="t('creatorMarketplace.chooseAgent')" :options="agentOptions" /></label>
      <label>{{ t('creatorMarketplace.knowledgeBases') }}<t-select v-model="form.knowledge_base_ids" multiple filterable :placeholder="t('creatorMarketplace.chooseKnowledgeBases')" :options="kbOptions" /></label>
      <p class="market-note">{{ t('creatorMarketplace.sourceNote') }}</p>
      <p v-if="!agents.length || !knowledgeBases.length" class="market-note">{{ t('creatorMarketplace.noSources') }} <RouterLink class="market-link" to="/platform/agents">{{ t('creatorMarketplace.openAgents') }}</RouterLink> · <RouterLink class="market-link" to="/platform/knowledge-bases">{{ t('creatorMarketplace.openKnowledgeBases') }}</RouterLink></p>
      <div class="market-form-grid"><label>{{ t('creatorMarketplace.monthlyPrice') }}<t-input v-model="monthlyInput" inputmode="decimal" placeholder="19.00" /></label><label>{{ t('creatorMarketplace.yearlyPrice') }}<t-input :value="yearlyPreview" readonly /></label></div>
      <p class="market-note">{{ t('creatorMarketplace.yearlyRule') }} {{ admin ? t('creatorMarketplace.adminPriceNote') : '' }}</p>
      <p class="market-note">{{ t(p?.reviewed_at ? 'creatorMarketplace.pricingModeLocked' : 'creatorMarketplace.freePriceHint') }}</p>
      <label>{{ t('creatorMarketplace.examplesLabel') }}<t-textarea v-model="examplesInput" :autosize="{ minRows: 3, maxRows: 6 }" /></label>
      <label>{{ t('creatorMarketplace.contact') }}<t-input v-model="form.contact" :maxlength="255" /></label>
      <label>{{ t('creatorMarketplace.authorization') }}<t-textarea v-model="form.authorization" :maxlength="5000" :autosize="{ minRows: 2, maxRows: 6 }" /></label>
      <t-checkbox v-model="form.authorization_confirmed">{{ t('creatorMarketplace.rights') }}</t-checkbox>
      <p v-if="validationError" class="market-error" role="alert">{{ validationError }}</p>
    </form>
  </t-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { listAgents, type CustomAgent } from '@/api/agent'
import { listKnowledgeBases } from '@/api/knowledge-base'
import { saveCreatorProduct, saveAdminMarketplaceProduct, type MarketplaceProduct, type MarketplaceProductInput } from '@/api/creator-marketplace'
import { annualAmountForMonthly, isFreeMarketProduct, parseMonthlyAmount } from './marketplacePresentation'
const props = defineProps<{ product?: MarketplaceProduct; admin?: boolean }>()
const emit = defineEmits<{ close: []; saved: [product: MarketplaceProduct] }>()
const { t } = useI18n()
const p = props.product
const form = reactive<MarketplaceProductInput>({ title: p?.title || '', description: p?.description || '', category: p?.category || '', cover_url: p?.cover_url || '', agent_id: p?.agent_id || '', knowledge_base_ids: [...(p?.knowledge_base_ids || [])], currency: 'USD', monthly_amount: p?.monthly_amount || 0, contact: p?.contact || '', authorization: p?.authorization || '', authorization_confirmed: p?.authorization_confirmed || false })
const monthlyInput = ref(p ? (p.monthly_amount / 100).toFixed(2) : '')
const examplesInput = ref(p?.sample_questions?.join('\n') || '')
const yearlyPreview = computed(() => { const amount = parseMonthlyAmount(monthlyInput.value); return amount !== null ? (annualAmountForMonthly(amount) / 100).toFixed(2) : '—' })
const agents = ref<CustomAgent[]>([])
const knowledgeBases = ref<Array<{ id: string; name: string }>>([])
const loading = ref(false)
const failedSources = ref(false)
const saving = ref(false)
const validationError = ref('')
const agentOptions = computed(() => {
  const values = agents.value.map(a => ({ value: a.id, label: a.name }))
  if (form.agent_id && !values.some(a => a.value === form.agent_id)) values.push({ value: form.agent_id, label: p?.agent_name || form.agent_id })
  return values
})
const kbOptions = computed(() => {
  const values = knowledgeBases.value.map(k => ({ value: k.id, label: k.name }))
  form.knowledge_base_ids.forEach((id, i) => { if (!values.some(k => k.value === id)) values.push({ value: id, label: p?.knowledge_base_names?.[i] || id }) })
  return values
})
async function loadSources() {
  loading.value = true; failedSources.value = false
  try {
    const [agentResult, kbResult] = await Promise.all([listAgents({ creator: 'mine' }), listKnowledgeBases({ creator: 'mine' })])
    agents.value = (agentResult.data || []).filter(a => !a.is_builtin)
    knowledgeBases.value = (kbResult as any).data || []
  } catch { failedSources.value = true }
  finally { loading.value = false }
}
async function save() {
  if (saving.value) return
  validationError.value = ''
  const amount = parseMonthlyAmount(monthlyInput.value)
  if (!form.title.trim() || !form.description.trim() || !form.agent_id || !form.knowledge_base_ids.length || amount === null || !form.contact.trim() || !form.authorization.trim() || !form.authorization_confirmed) {
    validationError.value = t('creatorMarketplace.titleRequired'); return
  }
  if (p?.reviewed_at && isFreeMarketProduct(p) !== isFreeMarketProduct({ monthly_amount: amount, yearly_amount: annualAmountForMonthly(amount) })) {
    validationError.value = t('creatorMarketplace.pricingModeLocked'); return
  }
  if (form.cover_url && !/^https:\/\//i.test(form.cover_url.trim())) { validationError.value = t('creatorMarketplace.coverInvalid'); return }
  saving.value = true
  try {
    const input: MarketplaceProductInput = { ...form, title: form.title.trim(), description: form.description.trim(), monthly_amount: amount, sample_questions: examplesInput.value.split('\n').map(q => q.trim()).filter(Boolean).slice(0, 8), default_model_id: 'builtin-deepseek-v4-flash' }
    const saved = props.admin && p ? await saveAdminMarketplaceProduct(p.id, input) : await saveCreatorProduct(input, p?.id)
    MessagePlugin.success(t('creatorMarketplace.saved')); emit('saved', saved)
  } catch (error: any) { validationError.value = error?.message || t('creatorMarketplace.saveFailed') }
  finally { saving.value = false }
}
onMounted(loadSources)
</script>
