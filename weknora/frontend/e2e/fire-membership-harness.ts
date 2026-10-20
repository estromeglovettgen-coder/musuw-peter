import { createApp, h } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import '@/assets/fire/fire-theme.css'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useFireMembershipStore } from '@/stores/fireMembership'
import UserMenu from '@/components/UserMenu.vue'
import Menu from '@/components/menu.vue'
import { useUIStore } from '@/stores/ui'
import FireUsage from '@/views/fire/FireUsage.vue'
import FireManagement from '@/views/fire/FireManagement.vue'
import ShowcaseView from '@/views/fire/ShowcaseView.vue'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
const params = new URLSearchParams(location.search)
const admin = params.has('admin')
const platform = params.has('platform')
const pinia = createPinia(), auth = useAuthStore(pinia)
i18n.global.locale.value = 'zh-CN'
const user = { id: admin ? 'admin-fixture' : 'member-fixture', username: admin ? '管理者' : 'Taylor学员', email: 'fixture@example.test', is_system_admin: admin, tenant_id: 42 }
auth.setUser(user as any); auth.setTenant({ id: 42, name: '火种', owner_id: user.id } as any); auth.setToken('membership-fixture-token'); auth.setLiteMode(false)
const routes = [
  { path: '/platform/creatChat', component: { render: () => h('div', { class: 'fixture-home' }, '历史和新对话入口') } },
  { path: '/platform/usage', component: FireUsage, beforeEnter: () => admin || '/platform/creatChat' },
  { path: '/platform/manage', component: FireManagement },
  { path: '/platform/showcase', name: 'fireShowcase', component: ShowcaseView },
  { path: '/platform/settings', component: { render: () => null } },
]
const router = createRouter({ history: createMemoryHistory(), routes: platform ? [{
  path: '/platform', component: () => import('@/views/platform/index.vue'),
  children: routes.map(item => ({ ...item, path: item.path.replace('/platform/', '') })),
}] : routes })
;(window as any).__fireFixture = { auth, router, membership: useFireMembershipStore(pinia) }
if (params.has('nav') || platform) { auth.setLiteMode(true); useUIStore(pinia).expandSidebar() }
const app = createApp({ render: () => platform ? h(RouterView) : [params.has('nav') ? h(Menu) : h('aside', { class: 'fixture-sidebar' }, h(UserMenu)), h('div', { class: 'fixture-main' }, h(RouterView))] })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push(params.get('page') === 'showcase' ? '/platform/showcase' : params.get('page') === 'manage' ? '/platform/manage' : params.get('page') === 'usage' ? '/platform/usage' : '/platform/creatChat')
await router.isReady()
app.mount('#app')
