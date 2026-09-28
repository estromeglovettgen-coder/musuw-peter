import { DialogPlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

interface ConsumerUpgradePromptOptions {
  onCancel?: () => void
}

export function useConsumerUpgradePrompt() {
  const { t } = useI18n()
  const router = useRouter()

  return (body: string, options: ConsumerUpgradePromptOptions = {}) => {
    const dialog = DialogPlugin.confirm({
      header: t('entitlement.upgradeRequiredTitle'),
      body,
      confirmBtn: t('entitlement.viewPlans'),
      cancelBtn: t('entitlement.notNow'),
      closeBtn: false,
      closeOnOverlayClick: false,
      onConfirm: () => {
        dialog.hide()
        void router.push('/plans')
      },
      onCancel: () => {
        dialog.hide()
        options.onCancel?.()
      },
    })
    return dialog
  }
}
