import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import ChatView from '@/views/chat/index.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
i18n.global.locale.value = 'zh-CN'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/platform/chat/:chatid', component: ChatView }],
})
const pinia = createPinia()
const auth = useAuthStore(pinia)
auth.setUser({ id: 'archive-user', username: '归档验收', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: '归档验收空间', owner_id: 'archive-user' } as any)
auth.setToken('archive-fixture-token')
auth.setLiteMode(true)
useSettingsStore(pinia).settings.selectedAgentId = 'agent-peter'

// Invoke the real ChatView send handler with a browser File, without relying on
// the operating system's file chooser in this focused network-boundary test.
const chat = ref<any>()
const file = new File(['客户原始聊天：本周末复盘。'], '聊天记录.txt', { type: 'text/plain' })
const app = createApp({
  setup() {
    onMounted(() => {
      ;(window as any).sendSyntheticCustomerChat = (mentionId?: string) => {
        void chat.value.$.setupState.sendMsg('请分析这份记录', '', mentionId ? [{ type: 'kb', id: mentionId, name: '新客户' }] : [],
          [], [{ file, name: file.name, size: file.size, status: 'pending' }], true, '')
      }
      ;(window as any).customerChatRoute = () => router.currentRoute.value.path
      ;(window as any).customerChatReplying = () => chat.value.$.setupState.isReplying
    })
    return () => h('div', { style: 'display:flex;flex-direction:column;height:100%;min-height:0' },
      [h(RouterView, null, { default: ({ Component }: any) => h(Component, { ref: chat }) })])
  },
})
app.use(pinia).use(router).use(i18n).use(TDesign)
await router.push('/platform/chat/customer-session')
await router.isReady()
app.mount('#app')
