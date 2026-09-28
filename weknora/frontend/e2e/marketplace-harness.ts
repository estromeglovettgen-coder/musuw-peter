import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
// Discover the real default graph renderer dependency before interactions.
// Otherwise Vite's first cold lazy import re-optimizes deps and reloads the harness.
import 'pixi.js'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useMenuStore } from '@/stores/menu'
import { provideChatReferencesDrawer } from '@/composables/useChatReferencesDrawer'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'
import WikiBrowser from '@/views/knowledge/wiki/WikiBrowser.vue'
import MarketplaceKnowledgeBase from '@/views/marketplace/MarketplaceKnowledgeBase.vue'
import KnowledgeBaseList from '@/views/knowledge/KnowledgeBaseList.vue'
import Marketplace from '@/views/marketplace/Marketplace.vue'
import ProductDetail from '@/views/marketplace/ProductDetail.vue'
import Orders from '@/views/marketplace/Orders.vue'
import CreatorProducts from '@/views/marketplace/CreatorProducts.vue'
import AdminMarketplace from '@/views/marketplace/AdminMarketplace.vue'
import CreateChat from '@/views/creatChat/creatChat.vue'
import Chat from '@/views/chat/index.vue'
import DocInfo from '@/views/chat/components/docInfo.vue'
import ChatReferencesDrawer from '@/components/ChatReferencesDrawer.vue'
installTDesignIconOfflineGuard()
const params = new URLSearchParams(location.search)
const pinia = createPinia()
const auth = useAuthStore(pinia)
auth.setUser({ id: 'market-user', username: 'Market acceptance', tenant_id: '42', is_system_admin: true } as any)
auth.setTenant({ id: '42', name: 'Acceptance workspace', owner_id: 'market-user' } as any)
auth.setMemberships([{ tenant_id: '42', role: 'owner' }] as any)
auth.setToken('market-fixture-token')
auth.setLiteMode(true)
i18n.global.locale.value = 'zh-CN'
const settings = useSettingsStore(pinia)
const menu = useMenuStore(pinia)
const ReferenceHarness = defineComponent({ setup() {
  provideChatReferencesDrawer()
  const session = { id: 'market-answer', marketplace_product_id: 'taylor', knowledge_references: [{ id: 'chunk-one', knowledge_id: 'source-doc', knowledge_base_id: 'source-kb', knowledge_title: 'Restricted source document', content: 'A purchased answer citation snippet', chunk_type: 'text' }] }
  return () => h('div', [h('button', { onClick: () => settings.selectAgent('builtin-smart-reasoning') }, 'Switch composer to normal'), h(DocInfo, { session }), h(ChatReferencesDrawer)])
} })
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/platform/marketplace/:productId/knowledge-bases/:kbId', name: 'marketplaceKnowledgeBase', component: MarketplaceKnowledgeBase },
  { path: '/platform/knowledge-bases', component: KnowledgeBaseList },
  { path: '/platform/agents', component: () => import('@/views/agent/AgentList.vue') },
  { path: '/platform/marketplace', name: 'marketplace', component: Marketplace },
  { path: '/platform/marketplace/:productId', name: 'marketplaceProduct', component: ProductDetail },
  { path: '/platform/orders', name: 'marketplaceOrders', component: Orders },
  { path: '/platform/creator-products', name: 'creatorProducts', component: CreatorProducts },
  { path: '/platform/marketplace-admin', name: 'marketplaceAdmin', component: AdminMarketplace },
  { path: '/platform/creatChat', name: 'globalCreatChat', component: CreateChat },
  { path: '/platform/chat/:chatid', name: 'chat', component: Chat },
  { path: '/native-wiki', component: { render: () => h('div', { style: 'height: 800px' }, [h(WikiBrowser, { knowledgeBaseId: 'own-kb', canEdit: params.get('editable') === 'true' })]) } },
  { path: '/references', component: ReferenceHarness },
  { path: '/plans', component: { render: () => h('p', 'Membership management') } },
] })
;(window as any).__marketplaceHarness = { router, settings, menu }
const app = createApp({ render: () => h('div', [h('nav', { 'aria-label': 'Test navigation' }, [h('button', { onClick: () => router.push('/platform/marketplace') }, 'Visit market'), h('button', { onClick: () => router.push('/platform/creatChat') }, 'Visit chat')]), h(RouterView)]) })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push(params.get('path') || '/platform/marketplace')
await router.isReady()
app.mount('#app')
