import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory, RouterView } from 'vue-router'
import 'tdesign-vue-next/es/style/index.css'
import '@/assets/theme/theme.css'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'
import { installTDesignServices } from '@/utils/installTDesignServices'
import i18n from './i18n/embed'
import EmbedPage from '@/views/embed/EmbedPage.vue'

installTDesignIconOfflineGuard()

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/embed/:channelId',
      name: 'embed',
      component: EmbedPage,
    },
  ],
})

// Runtime-only Vue build cannot compile string templates — use a render fn.
const app = createApp({ render: () => h(RouterView) })

installTDesignServices(app)
app.use(createPinia())
app.use(router)
app.use(i18n)

router.isReady().finally(() => {
  app.mount('#embed-app')
})
