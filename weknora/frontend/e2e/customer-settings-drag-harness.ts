import { createApp, h, onMounted, ref } from 'vue'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/dist/tdesign.css'
import '@/assets/musuw-visual.less'
import i18n from '@/i18n'
import { installTDesignIconOfflineGuard } from '@/utils/tdesign-icon-offline'
import CustomerSettingsDialog from '@/views/customer/CustomerSettingsDialog.vue'

installTDesignIconOfflineGuard()
i18n.global.locale.value = 'zh-CN'
const app = createApp({
  setup() {
    const visible = ref(false)
    onMounted(() => { visible.value = true })
    return () => h(CustomerSettingsDialog, {
      visible: visible.value,
      'onUpdate:visible': (value: boolean) => { visible.value = value },
    })
  },
})
app.use(i18n).use(TDesign)
app.mount('#app')
