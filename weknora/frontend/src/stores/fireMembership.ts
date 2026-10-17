import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fireMembershipApi, type FireMembership } from '@/api/fire-membership'
import { useAuthStore } from '@/stores/auth'

/** Native bearer identity scopes this snapshot; never persist membership or credentials. */
export const useFireMembershipStore = defineStore('fire-membership', () => {
  const auth = useAuthStore()
  const scope = computed(() => auth.currentUserId ? `${auth.currentUserId}:${auth.effectiveTenantId || ''}` : '')
  const value = ref<FireMembership | null>(null), error = ref(''), loading = ref(false)
  let sequence = 0, loadedAt = 0, pending: Promise<void> | null = null
  async function refresh(force = true): Promise<void> {
    if (!scope.value || auth.isSystemAdmin) return
    if (pending) return pending
    if (!force && value.value && Date.now() - loadedAt < 30000) return
    const startedScope = scope.value, generation = ++sequence
    loading.value = true
    const work = (async () => {
      try {
        const response = await fireMembershipApi.current()
        if (generation !== sequence || startedScope !== scope.value) return
        value.value = response; error.value = ''; loadedAt = Date.now()
      } catch (cause: unknown) {
        if (generation !== sequence || startedScope !== scope.value) return
        error.value = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '套餐读取失败，请重试'
      } finally {
        if (generation === sequence) { loading.value = false; pending = null }
      }
    })()
    pending = work
    return work
  }
  watch([scope, () => auth.isSystemAdmin], () => {
    sequence += 1; pending = null; loadedAt = 0; value.value = null; error.value = ''; loading.value = false
  }, { flush: 'sync' })
  const onVisible = () => { if (document.visibilityState === 'visible') void refresh(false) }
  const onUpdated = () => { void refresh() }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('fire-membership-updated', onUpdated)
    onScopeDispose(() => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('fire-membership-updated', onUpdated)
    })
  }
  return { membership: value, error, loading, refresh }
})
