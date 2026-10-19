import { createApp, h, onMounted, ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useChatResourcesStore } from '@/stores/chatResources'
import { useEditorResourcesStore } from '@/stores/editorResources'
import { useDeploymentCapabilitiesStore } from '@/stores/deploymentCapabilities'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'
import AgentEditorModal from '@/views/agent/AgentEditorModal.vue'
import KBModelConfig from '@/views/knowledge/settings/KBModelConfig.vue'
import KBAdvancedSettings from '@/views/knowledge/settings/KBAdvancedSettings.vue'
import ModelSelector from '@/components/ModelSelector.vue'

installTDesignIconOfflineGuard()
const params = new URLSearchParams(location.search)
const pinia = createPinia()
const auth = useAuthStore(pinia)
auth.setUser({ id: 'surface-user', username: '界面验收', tenant_id: '42', is_system_admin: params.has('admin') } as any)
auth.setTenant({ id: '42', name: '界面验收空间', owner_id: 'surface-user' } as any)
auth.setToken('offline-surface-fixture')
auth.setLiteMode(false)
i18n.global.locale.value = 'zh-CN'
const models = [
  { id: 'chat-configured', type: 'KnowledgeQA', name: 'deepseek-flash', display_name: 'DeepSeek Flash', is_default: true, status: 'active' },
  { id: 'rerank-configured', type: 'Rerank', name: 'rerank-provider', display_name: 'Rerank Provider', is_default: true, status: 'active' },
  { id: 'vision-configured', type: 'VLLM', name: 'gemini-vision', display_name: 'Gemini Vision', is_default: true, status: 'active' },
  { id: 'asr-configured', type: 'ASR', name: 'whisper', display_name: 'Whisper', is_default: true, status: 'active' },
]
const resources = useChatResourcesStore(pinia)
resources.allModels = params.has('missingModels') ? [] : models as any
resources.rawKnowledgeBases = []
for (const action of ['ensureModels', 'ensureKnowledgeBases', 'ensureWebSearchProviders', 'ensureSandboxConfigs'] as const) resources[action] = async () => {}
const editor = useEditorResourcesStore(pinia)
editor.prefetchAgentEditorDeps = async () => {}
if (!params.has('skillState')) {
  editor.ensureSkills = async () => {}
  editor.ensureSkillCatalog = async () => {}
}
editor.agentTypePresets = [{ id: 'hybrid-rag-wiki', i18n: { default: { name: 'Wiki + RAG 混合', description: '' }, 'zh-CN': { name: 'Wiki + RAG 混合', description: '' } }, config: { allowed_tools: ['knowledge_search', 'wiki_search'], kb_selection_mode: 'all' } }] as any
editor.promptTemplates = { agent_system_prompt: [{ id: 'default', mode: 'rag', default: true, content: '我是泰勒，结合课程回答。' }] } as any
const deployment = useDeploymentCapabilitiesStore(pinia)
deployment.loaded = true
deployment.capabilities = { 'settings.sandbox': { supported: false, reason: 'fixture_disabled' } } as any
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
const visible = ref(false)
const chatView = ref<'overview' | 'models' | 'reasoning'>('models')
const existingAgent = { id: 'existing-agent', name: '用户自己的名字', description: '', config: { agent_mode: 'smart-reasoning', agent_type: 'hybrid-rag-wiki', model_id: 'chat-configured', rerank_model_id: 'rerank-configured', allowed_tools: ['wiki_search'], kb_selection_mode: 'none', skills_selection_mode: 'none', image_upload_enabled: false, audio_upload_enabled: false, system_prompt: '这是保留的原有提示词。', question_suggestions: { follow_ups: { enabled: true, mode: 'generated', model_id: 'chat-configured' } } } }
if (params.has('skillState')) {
  Object.assign(existingAgent.config, {
    skills_selection_mode: params.get('skillState') === 'all' ? 'all' : 'selected',
    selected_skills: ['persisted-private-skill', 'catalog-removed-skill'],
    sandbox_config_id: params.get('skillState') === 'unbound' ? '' : 'saved-sandbox',
  })
  resources.sandboxConfigs = [{ id: 'only-available-sandbox', name: 'Only sandbox', sandbox_type: 'docker', config: {} }] as any
}
const app = createApp({ setup() {
  onMounted(() => { visible.value = true })
  return () => params.get('surface') === 'selectors' ? h('main', [
    h('section', { 'data-testid': 'catalog' }, h(ModelSelector, { allModels: models, selectedModelId: 'chat-configured' } as any)),
    h('section', { 'data-testid': 'chat' }, h(ModelSelector, { mode: 'chat', view: chatView.value, 'onUpdate:view': (value: 'overview' | 'models' | 'reasoning') => { chatView.value = value }, models, selectedModelId: 'chat-configured', selectedModelDisplayName: 'DeepSeek Flash', agents: [{ id: 'fire-taylor', name: '泰勒', config: { agent_mode: 'smart-reasoning' } }], selectedAgentId: 'fire-taylor', selectedAgentDisplayName: '泰勒', reasoningOptions: [{ value: 'low', label: '低' }, { value: 'high', label: '高' }], reasoningEffort: 'low' } as any)),
    h(KBModelConfig, { config: { llmModelId: 'chat-configured', embeddingModelId: 'embedding-configured', wikiSynthesisModelId: 'chat-configured' }, hasFiles: false, wikiEnabled: true, ragEnabled: true, allModels: models }),
    h(KBAdvancedSettings, { autoTag: { enabled: true, modelId: 'chat-configured', maxTags: 3, skipIfTagged: true }, allModels: models }),
  ]) : h(AgentEditorModal, { visible: visible.value, mode: params.has('edit') ? 'edit' : 'create', agent: params.has('edit') ? existingAgent as any : null, initialSection: params.get('section') || undefined, 'onUpdate:visible': (value: boolean) => { visible.value = value } })
} })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push('/')
await router.isReady()
app.mount('#app')
