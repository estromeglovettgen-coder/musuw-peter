import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import Menu from '@/components/menu.vue'
import { initFont } from '@/composables/useFont'
import { initTheme } from '@/composables/useTheme'
import { installReferenceTextareaAutosize } from '@/utils/referenceTextareaAutosize'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
initTheme()
initFont()
installReferenceTextareaAutosize()

const Workspace = defineComponent({
  name: 'BatchAcceptanceWorkspace',
  setup() {
    return () => h(Menu)
  },
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/platform/creatChat' },
    { path: '/platform/creatChat', name: 'globalCreatChat', component: Workspace },
    { path: '/platform/:pathMatch(.*)*', name: 'platformFallback', component: Workspace },
  ],
})

const pinia = createPinia()
const authStore = useAuthStore(pinia)
const uiStore = useUIStore(pinia)

i18n.global.locale.value = 'zh-CN'
uiStore.expandSidebar()
authStore.setUser({
  id: 'batch-acceptance-user',
  username: '批量删除验收用户',
  email: 'batch-acceptance@example.test',
  tenant_id: '42',
  can_access_all_tenants: false,
  is_system_admin: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})
authStore.setTenant({
  id: '42',
  name: '批量删除验收空间',
  owner_id: 'batch-acceptance-user',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})
authStore.setToken('batch-acceptance-token')
// Lite skips unrelated IM/embed discovery, keeping the harness focused on the
// real session sidebar and its real batch controller.
authStore.setLiteMode(true)

const app = createApp({
  name: 'BatchAcceptanceHarness',
  render: () => h(RouterView),
})

app.use(pinia)
app.use(router)
app.use(i18n)
app.use(TDesign)

await router.push('/platform/creatChat')
await router.isReady()
app.mount('#app')
