import { computed, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { listMarketplaceLibrary, type MarketplaceLibraryEntry } from '@/api/creator-marketplace'

/** One purchased-resource request per directory, isolated from previous accounts. */
export function useMarketplaceLibrary() {
  const auth = useAuthStore()
  const entries = ref<MarketplaceLibraryEntry[]>([])
  const loading = ref(true)
  const failed = ref(false)
  const scope = computed(() => `${auth.isLoggedIn}:${auth.user?.id}:${auth.currentTenantId}:${auth.selectedTenantId}`)
  let sequence = 0

  async function load() {
    const run = ++sequence
    const key = scope.value
    entries.value = []
    failed.value = false
    loading.value = auth.isLoggedIn
    if (!auth.isLoggedIn) return
    try {
      const rows = await listMarketplaceLibrary()
      if (run === sequence && key === scope.value) entries.value = rows
    } catch {
      if (run === sequence && key === scope.value) failed.value = true
    } finally {
      if (run === sequence) loading.value = false
    }
  }

  watch(scope, load, { immediate: true, flush: 'sync' })
  onUnmounted(() => { sequence++ })
  return { entries, loading, failed, load }
}
