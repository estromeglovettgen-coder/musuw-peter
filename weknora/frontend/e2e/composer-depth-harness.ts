import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import InputField from '@/components/Input-field.vue'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/platform/creatChat', name: 'globalCreatChat', component: { render: () => null } }] })
const pinia = createPinia()
const auth = useAuthStore(pinia)
i18n.global.locale.value = 'zh-CN'
auth.setUser({ id: 'depth-fixture-user', username: '深度验收', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: '深度验收空间', owner_id: 'depth-fixture-user' } as any)
auth.setToken('depth-fixture-token')
auth.setLiteMode(false)
const settings = useSettingsStore(pinia)
settings.selectAgent('fixture-taylor')
settings.updateConversationModels({ selectedChatModelId: 'fixture-flash', reasoningModelId: 'fixture-flash', reasoningEffort: 'high', thinkingEnabled: true })
;(window as any).__depthFixture = { settings }
const app = createApp({ render: () => h(InputField) })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push('/platform/creatChat')
await router.isReady()
app.mount('#app')
