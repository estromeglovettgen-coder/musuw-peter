import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import FAQEntryManager from '@/views/knowledge/components/FAQEntryManager.vue'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
const pinia = createPinia()
const auth = useAuthStore(pinia)
i18n.global.locale.value = 'zh-CN'
auth.setUser({ id: 'upload-user', username: '上传验收', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: '上传验收空间', owner_id: 'upload-user' } as any)
auth.setToken('upload-fixture-token')
const app = createApp({ render: () => h(FAQEntryManager, { kbId: 'upload-kb' }) })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push('/')
await router.isReady()
app.mount('#app')
