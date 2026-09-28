import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import Plans from '@/views/billing/Plans.vue'
import Checkout from '@/views/billing/Checkout.vue'
import UserMenu from '@/components/UserMenu.vue'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
const params = new URLSearchParams(location.search)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/plans', component: Plans },
    { path: '/checkout', component: Checkout },
    { path: '/platform/knowledge-bases', component: UserMenu },
  ],
})
const pinia = createPinia()
const auth = useAuthStore(pinia)
i18n.global.locale.value = 'zh-CN'
auth.setUser({ id: 'billing-user', username: 'Billing acceptance', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: 'Billing acceptance', owner_id: 'billing-user' } as any)
auth.setMemberships([{ tenant_id: '42', role: params.get('role') || 'owner' }] as any)
auth.setToken('billing-fixture-token')
auth.setLiteMode(true)
useUIStore(pinia).expandSidebar()
const app = createApp({ render: () => h(RouterView) })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push(params.get('path') || '/plans')
await router.isReady()
app.mount('#app')
