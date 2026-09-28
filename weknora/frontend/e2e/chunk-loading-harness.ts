// Local browser fixture only; excluded from the production entrypoints.
// Exercise production Markdown/Mermaid code after a cold dynamic import.
import { createApp, defineAsyncComponent, h, ref } from 'vue'
import i18n from '@/i18n'

const MarkdownPage = defineAsyncComponent(() => import('@/views/dev/MarkdownTestPage.vue'))
const show = ref(false)
createApp({
  setup() {
    return () => [
      h('button', { onClick: () => { show.value = !show.value } }, show.value ? 'Close rendering' : 'Open rendering'),
      show.value ? h(MarkdownPage) : null,
    ]
  },
}).use(i18n).mount('#app')
