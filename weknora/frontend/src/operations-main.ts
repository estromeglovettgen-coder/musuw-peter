import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/noto-sans-sc'
import OperationsApp from './operations/OperationsApp.vue'
import './operations/operations-console.less'
import i18n from './i18n'
import { installTDesignIconOfflineGuard } from './utils/tdesign-icon-offline'

installTDesignIconOfflineGuard()

const app = createApp(OperationsApp)
app.config.errorHandler = (error, instance, info) => {
  console.error('[Musuw Operations] Unhandled Vue error', error, instance, info)
}
app.use(TDesign)
app.use(createPinia())
app.use(i18n)
app.mount('#operations-app')
