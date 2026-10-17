import { defineAsyncComponent, type AsyncComponentLoader, type Component } from 'vue'
import { DialogPlugin } from 'tdesign-vue-next'
import i18n from '@/i18n'

export function defineRecoverableAsyncComponent<T extends Component>(loader: AsyncComponentLoader<T>, onCancel: () => void): T {
  return defineAsyncComponent({
    loader,
    onError(_error, _retry, fail) {
      // A failed URL remains in the browser's module map until this document
      // reloads. Never pretend that repeating the same import will recover.
      const dialog = DialogPlugin.confirm({
        header: i18n.global.t('common.resourceLoadFailed.title'),
        body: i18n.global.t('common.resourceLoadFailed.body'),
        confirmBtn: i18n.global.t('common.resourceLoadFailed.reload'),
        cancelBtn: i18n.global.t('common.cancel'),
        closeOnOverlayClick: false,
        onConfirm() { dialog.destroy(); window.location.reload() },
        onClose() { onCancel(); dialog.destroy(); fail() },
      })
    },
  })
}
