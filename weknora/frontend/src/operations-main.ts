import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'tdesign-vue-next/dist/tdesign.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/noto-sans-sc'
import OperationsApp from './operations/OperationsApp.vue'
import './operations/operations-console.less'
import i18n, { i18nReady } from './i18n'
import { installTDesignIconOfflineGuard } from './utils/tdesign-icon-offline'
import { installTDesignServices } from './utils/installTDesignServices'

installTDesignIconOfflineGuard()

const app = createApp(OperationsApp)
installTDesignServices(app)
app.config.errorHandler = (error, instance, info) => {
  console.error('[Musuw Operations] Unhandled Vue error', error, instance, info)
}
app.use(createPinia())
app.use(i18n)
void i18nReady.catch(error => {
  console.warn('[Musuw Operations] Locale unavailable; using Chinese fallback', error)
  i18n.global.locale.value = 'zh-CN'
}).then(() => app.mount('#operations-app'))
