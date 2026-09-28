import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { getMarketplaceProduct, type MarketplaceProduct } from '@/api/creator-marketplace'
import type { CustomAgent } from '@/api/agent'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { DEFAULT_CHAT_MODEL_ID } from '@/utils/managedChatModels'

/** Read-only product presentation, deliberately separate from editable workspace resources. */
export const useMarketplaceChatStore = defineStore('marketplaceChat', () => {
  const auth = useAuthStore()
  const settings = useSettingsStore()
  const product = ref<MarketplaceProduct | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const scope = computed(() => `${auth.currentUserId || ''}:${auth.effectiveTenantId || ''}`)
  let generation = 0
  let pending: Promise<MarketplaceProduct> | null = null
  let pendingId = ''
  const selectedProduct = computed(() => product.value?.id === settings.settings.marketplaceProductId ? product.value : null)
  const agent = computed<CustomAgent | null>(() => {
    const selected = selectedProduct.value
    if (!selected) return null
    return {
      id: selected.agent_id,
      name: selected.agent_name || selected.title,
      description: selected.description,
      is_builtin: false,
      config: {
        agent_mode: 'smart-reasoning',
        model_id: DEFAULT_CHAT_MODEL_ID,
        kb_selection_mode: 'selected',
        knowledge_bases: selected.knowledge_base_ids,
        mcp_selection_mode: 'none',
        skills_selection_mode: 'none',
        web_search_enabled: false,
      },
    }
  })
  const knowledgeBases = computed(() => selectedProduct.value?.knowledge_base_ids.map((id, index) => ({
    id, name: selectedProduct.value?.knowledge_base_names?.[index] || selectedProduct.value?.title || id,
    type: 'document',
  })) || [])
  function clear() { generation++; product.value = null; pending = null; pendingId = ''; loading.value = false; failed.value = false }
  async function load(id: string, force = false): Promise<MarketplaceProduct> {
    if (!force && product.value?.id === id) return product.value
    if (pending && pendingId === id) return pending
    const run = ++generation
    const currentScope = scope.value
    loading.value = true; failed.value = false; pendingId = id
    pending = getMarketplaceProduct(id).then(value => {
      if (run !== generation || currentScope !== scope.value) throw new Error('Marketplace context changed')
      product.value = value
      return value
    }).catch(error => { if (run === generation) failed.value = true; throw error }).finally(() => {
      if (run === generation) { loading.value = false; pending = null; pendingId = '' }
    })
    return pending
  }
  watch(scope, clear)
  return { product: selectedProduct, agent, knowledgeBases, loading, failed, load, clear }
})
