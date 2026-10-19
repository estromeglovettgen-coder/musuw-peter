import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import ChatView from '@/views/chat/index.vue'
import NewChat from '@/views/creatChat/creatChat.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()
i18n.global.locale.value = 'zh-CN'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/platform/chat/:chatid', component: ChatView }, { path: '/platform/creatChat', name: 'globalCreatChat', component: NewChat }],
})
const pinia = createPinia()
const auth = useAuthStore(pinia)
auth.setUser({ id: 'archive-user', username: '归档验收', tenant_id: '42' } as any)
auth.setTenant({ id: '42', name: '归档验收空间', owner_id: 'archive-user' } as any)
auth.setToken('archive-fixture-token')
auth.setLiteMode(true)
useSettingsStore(pinia).settings.selectedAgentId = new URLSearchParams(location.search).has('saved-custom') ? 'agent-personal' : 'agent-peter'
useSettingsStore(pinia).selectKnowledgeBases(['course-KB'])

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
      ;(window as any).sendCombinedCustomerChat = () => (window as any).sendTargetText([
        { type: 'kb', id: 'course-KB', name: '课程知识库' },
        { type: 'kb', id: 'customer-B', name: '新目标' },
      ], '结合课程分析一下这个目标')
      ;(window as any).sendTargetText = (items: any[], text = '继续分析') => {
        // The real picker stores its selected scopes before emitting send-msg.
        if (items.length) useSettingsStore(pinia).selectKnowledgeBases(items.filter(item => item.type === 'kb').map(item => item.id))
        return chat.value.$.setupState.sendMsg(text, '', items, [], [], true, '')
      }
      ;(window as any).targetChatNavigate = (path: string) => router.push(path)
      ;(window as any).targetAgentSelection = () => useSettingsStore(pinia).selectedAgentId
      ;(window as any).pickPersonalAgent = async () => {
        useSettingsStore(pinia).selectAgent('agent-personal')
        await chat.value.$.setupState.inputFieldRef.$.setupState.loadAgents()
      }
    })
    return () => h('div', { style: 'display:flex;flex-direction:column;height:100%;min-height:0' },
      [h(RouterView, null, { default: ({ Component }: any) => h(Component, { ref: chat, ...(new URLSearchParams(location.search).has('quick') ? { embeddedMode: true, agentId: 'builtin-quick-answer', kbIds: ['course-KB'] } : {}) }) })])
  },
})
app.use(pinia).use(router).use(i18n).use(TDesign)
const params = new URLSearchParams(location.search)
await router.push(params.has('home') ? '/platform/creatChat' : `/platform/chat/${params.get('session') || 'customer-session'}`)
await router.isReady()
app.mount('#app')
