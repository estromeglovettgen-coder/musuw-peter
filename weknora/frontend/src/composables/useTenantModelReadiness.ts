import { computed, onMounted, ref, watch } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useChatResourcesStore } from '@/stores/chatResources'
import {
  evaluateTenantModelReadiness,
} from '@/utils/tenantModelReadiness'

export function useTenantModelReadiness() {
  const uiStore = useUIStore()
  const chatResources = useChatResourcesStore()
  const readiness = computed(() => evaluateTenantModelReadiness(chatResources.allModels))
  const loaded = ref(false)
  const loading = ref(false)

  const refresh = async (force = false) => {
    loading.value = true
    try {
      await chatResources.ensureModels(force)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void refresh().catch(() => {})
  })

  watch(
    () => uiStore.showSettingsModal,
    (open, wasOpen) => {
      if (wasOpen && !open) {
        void refresh(true).catch(() => {})
      }
    },
  )

  const isReadyForDocumentKb = computed(
    () => readiness.value?.isReadyForDocumentKb ?? false,
  )

  const isReadyForAgent = computed(() => readiness.value?.isReadyForAgent ?? false)

  const hasChat = computed(() => readiness.value?.hasChat ?? false)

  return {
    readiness,
    loaded,
    loading,
    refresh,
    isReadyForDocumentKb,
    isReadyForAgent,
    hasChat,
  }
}
