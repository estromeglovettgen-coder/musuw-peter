// Real workspace/components, with an isolated API fixture on localhost:4194.
// This entry is excluded from the production build; it never uses a real account.
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/jetbrains-mono'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { initTheme } from '@/composables/useTheme'
import { initFont } from '@/composables/useFont'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'
import { installReferenceTextareaAutosize } from '@/utils/referenceTextareaAutosize'
import Platform from '@/views/platform/index.vue'
import ManualKnowledgeEditor from '@/components/manual-knowledge-editor.vue'

installTDesignIconOfflineGuard()
installReferenceTextareaAutosize()
initTheme()
initFont()
const pinia = createPinia()
const auth = useAuthStore(pinia)
auth.setUser({ id: 'mobile-user', username: '移动端验收', email: 'mobile@example.test', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: '验收空间', owner_id: 'mobile-user' } as any)
auth.setToken('mobile-fixture-only')
auth.setLiteMode(true)
i18n.global.locale.value = 'zh-CN'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/platform', component: Platform, children: [
    { path: 'creatChat', name: 'globalCreatChat', component: () => import('@/views/creatChat/creatChat.vue') },
    { path: 'chat/:chatid', name: 'chat', component: () => import('@/views/chat/index.vue') },
    { path: 'knowledge-bases', name: 'knowledgeBaseList', component: () => import('@/views/knowledge/KnowledgeBaseList.vue') },
    { path: 'knowledge-bases/:kbId', name: 'knowledgeBase', component: () => import('@/views/knowledge/KnowledgeBase.vue') },
    { path: 'agents', name: 'agentList', component: () => import('@/views/agent/AgentList.vue') },
    { path: 'settings', name: 'settings', component: () => import('@/views/settings/Settings.vue') },
    { path: 'marketplace', name: 'marketplace', component: () => import('@/views/marketplace/Marketplace.vue') },
    { path: 'marketplace/:productId/knowledge-bases/:kbId', name: 'marketplaceKnowledgeBase', component: () => import('@/views/marketplace/MarketplaceKnowledgeBase.vue') },
    { path: 'marketplace/:productId', name: 'marketplaceProduct', component: () => import('@/views/marketplace/ProductDetail.vue') },
    { path: 'orders', name: 'marketplaceOrders', component: () => import('@/views/marketplace/Orders.vue') },
  ] }],
})
const app = createApp({ render: () => [h(RouterView), h(ManualKnowledgeEditor)] })
app.use(pinia).use(router).use(i18n).use(TDesign)
const target = new URLSearchParams(location.search).get('page') || '/platform/knowledge-bases/mobile-kb'
await router.push(target)
await router.isReady()
app.mount('#app')
