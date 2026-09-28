import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import KnowledgeBase from '@/views/knowledge/KnowledgeBase.vue'
import ManualKnowledgeEditor from '@/components/manual-knowledge-editor.vue'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/platform/knowledge-bases/:kbId', component: KnowledgeBase }],
})
const pinia = createPinia()
const auth = useAuthStore(pinia)
i18n.global.locale.value = 'zh-CN'
auth.setUser({ id: 'upload-user', username: '上传验收', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: '上传验收空间', owner_id: 'upload-user' } as any)
auth.setToken('upload-fixture-token')
auth.setLiteMode(true)
const app = createApp({ render: () => [h(RouterView), h(ManualKnowledgeEditor)] })
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push('/platform/knowledge-bases/upload-kb')
await router.isReady()
app.mount('#app')
