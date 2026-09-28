import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  getCurrentEntitlement,
  type ConsumerEntitlement,
  type PaddleBillingConfig,
} from '@/api/entitlement'
import { useAuthStore } from '@/stores/auth'

// Reuse the menu's just-fetched provider snapshot while navigating into the
// usage page. This closes the brief OpenRouter settlement window without
// polling or inventing a local credit counter.
const CURRENT_ENTITLEMENT_FRESH_MS = 2_000
// A tab can emit focus and visibilitychange together (and repeatedly while
// switching windows). Revalidate at most once per cooldown from those
// activity signals; explicit refresh() calls remain immediate.
const ENTITLEMENT_REVALIDATION_COOLDOWN_MS = 30_000

export const useCurrentEntitlementStore = defineStore('current-entitlement', () => {
  const authStore = useAuthStore()
  const storedScope = ref('')
  const storedEntitlement = ref<ConsumerEntitlement | null>(null)
  const storedBilling = ref<PaddleBillingConfig | null>(null)
  const lastUpdatedAt = ref(0)
  const loadingScope = ref('')

  const scopeKey = computed(() => {
    const userID = String(authStore.currentUserId || '').trim()
    const tenantID = authStore.effectiveTenantId
    return userID && tenantID ? `${userID}:${tenantID}` : ''
  })
  const entitlement = computed(() =>
    storedScope.value === scopeKey.value ? storedEntitlement.value : null,
  )
  const billing = computed(() =>
    storedScope.value === scopeKey.value ? storedBilling.value : null,
  )
  const loading = computed(() => Boolean(scopeKey.value) && loadingScope.value === scopeKey.value)

  let activeRequestSequence = 0
  let inFlight: Promise<void> | null = null
  let inFlightScope = ''
  let lastActivityRevalidationAt = 0

  const invalidate = () => {
    activeRequestSequence += 1
    lastUpdatedAt.value = 0
    lastActivityRevalidationAt = 0
    loadingScope.value = ''
    inFlight = null
    inFlightScope = ''
  }

  const clear = () => {
    invalidate()
    storedScope.value = ''
    storedEntitlement.value = null
    storedBilling.value = null
  }

  const refresh = (force = true): Promise<void> => {
    const scope = scopeKey.value
    if (!scope) {
      clear()
      return Promise.resolve()
    }
    if (inFlight && inFlightScope === scope) return inFlight
    if (
      !force &&
      storedScope.value === scope &&
      storedEntitlement.value &&
      Date.now() - lastUpdatedAt.value < CURRENT_ENTITLEMENT_FRESH_MS
    ) {
      return Promise.resolve()
    }

    const requestSequence = ++activeRequestSequence
    lastActivityRevalidationAt = Date.now()
    if (storedScope.value !== scope) {
      storedEntitlement.value = null
      storedBilling.value = null
      lastUpdatedAt.value = 0
    }
    storedScope.value = scope
    loadingScope.value = scope
    const request = (async () => {
      try {
        const response = await getCurrentEntitlement()
        if (requestSequence !== activeRequestSequence || scope !== scopeKey.value) return
        storedEntitlement.value = response.data
        storedBilling.value = response.billing
        lastUpdatedAt.value = Date.now()
      } catch {
        if (requestSequence !== activeRequestSequence || scope !== scopeKey.value) return
        lastActivityRevalidationAt = 0
        // A failed revalidation must not replace a usable, scope-matched
        // provider snapshot with a loading/unavailable flash. With no prior
        // snapshot, keep the existing honest unavailable state.
        if (!storedEntitlement.value) {
          storedBilling.value = null
        }
        lastUpdatedAt.value = 0
      } finally {
        if (requestSequence === activeRequestSequence && scope === scopeKey.value) {
          loadingScope.value = ''
        }
        if (requestSequence === activeRequestSequence && inFlightScope === scope) {
          inFlight = null
          inFlightScope = ''
        }
      }
    })()
    inFlight = request
    inFlightScope = scope
    return request
  }

  const ensureFresh = () => refresh(false)

  const handleActivityRevalidation = () => {
    if (!scopeKey.value) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - lastActivityRevalidationAt < ENTITLEMENT_REVALIDATION_COOLDOWN_MS) return
    lastActivityRevalidationAt = now
    void ensureFresh()
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('focus', handleActivityRevalidation)
    document.addEventListener('visibilitychange', handleActivityRevalidation)
    onScopeDispose(() => {
      window.removeEventListener('focus', handleActivityRevalidation)
      document.removeEventListener('visibilitychange', handleActivityRevalidation)
    })
  }

  watch(scopeKey, (nextScope, previousScope) => {
    if (nextScope === previousScope) return
    clear()
    if (nextScope) void ensureFresh()
  })

  return {
    entitlement,
    billing,
    loading,
    refresh,
    ensureFresh,
    invalidate,
    clear,
  }
})
