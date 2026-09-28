import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

// Retry only failed reads; never reload the page or replay a submitted action.
export function useOperationsReadRecovery(error: Ref<string>, loading: Ref<boolean>, load: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function retry() {
    if (!error.value || loading.value || document.hidden || !navigator.onLine) return
    clearTimer()
    void load()
  }

  watch([error, loading], () => {
    clearTimer()
    if (error.value && !loading.value) timer = setTimeout(retry, 5_000)
  })

  onMounted(() => {
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    document.addEventListener('visibilitychange', retry)
  })

  onBeforeUnmount(() => {
    clearTimer()
    window.removeEventListener('online', retry)
    window.removeEventListener('focus', retry)
    document.removeEventListener('visibilitychange', retry)
  })
}
