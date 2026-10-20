<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const auth = useAuthStore()
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const frameVisible = ref(false), frameKey = ref(0), frameElement = ref<HTMLIFrameElement | null>(null)
let frameObserver: MutationObserver | undefined
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined
function clearTimer() { if (timer) clearTimeout(timer); timer = undefined }
function stopObservingFrame() { frameObserver?.disconnect(); frameObserver = undefined }
function fail() { clearTimer(); stopObservingFrame(); frameVisible.value = false; state.value = 'failed' }
function load() {
  const current = ++generation
  clearTimer(); stopObservingFrame(); frameVisible.value = false; state.value = 'loading'
  if (!auth.isLoggedIn) { state.value = 'failed'; return }
  // The child owns its authenticated bootstrap and private media cookie. Its
  // static document can load in parallel instead of waiting for a duplicate
  // parent request. Native route authorization still guards this workspace.
  frameKey.value += 1; frameVisible.value = true
  timer = setTimeout(() => { if (current === generation) fail() }, 20000)
}
function loaded(event: Event) { inspectFrame(event.target as HTMLIFrameElement) }
function inspectFrame(frame: HTMLIFrameElement) {
  if (!frame.isConnected || !frameVisible.value) return
  try {
    const document = frame.contentDocument
    if (!document?.body || !document.body.classList.contains('fire-workbench') || !frame.contentWindow?.location.pathname.startsWith('/tools/fire-showcase/') || /^(?:404|403|500|502|503|504|Cannot GET)\b/.test(document.body.innerText.trim())) { fail(); return }
    stopObservingFrame()
    const nativeHost = document.body.classList.contains('auth-pending') || document.body.dataset.fireHostState
    const syncReady = () => {
      if (!frame.isConnected || !frameVisible.value) return
      if (document.body.dataset.fireHostState === 'failed') { fail(); return }
      if (!nativeHost || (document.body.dataset.fireHostState === 'ready' && !document.body.classList.contains('auth-pending'))) { clearTimer(); state.value = 'ready' }
    }
    if (nativeHost) {
      frameObserver = new MutationObserver(syncReady)
      frameObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-fire-host-state'] })
    }
    syncReady()
  } catch { fail() }
}
function onHostMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || !frameElement.value || event.source !== frameElement.value.contentWindow) return
  if (event.data?.type !== 'fire-showcase:state' || !['ready', 'failed'].includes(event.data?.state)) return
  // Messages wake the same DOM checks used by load; they never authorize or
  // substitute the child document's actual identity/readiness state.
  inspectFrame(frameElement.value)
}
onMounted(() => window.addEventListener('message', onHostMessage))
watch(() => [auth.currentUserId, auth.effectiveTenantId, auth.isLoggedIn], load, { immediate: true })
watch([() => props.active, state], ([active, ready]) => {
  if (ready === 'ready') frameElement.value?.contentWindow?.postMessage({ type: 'fire-showcase:active', active }, window.location.origin)
}, { flush: 'post' })
onBeforeUnmount(() => { window.removeEventListener('message', onHostMessage); generation += 1; clearTimer(); stopObservingFrame() })
</script>

<template>
  <main class="fire-showcase" aria-label="展示面">
    <header class="fire-showcase__header"><div><h1>展示面</h1><p>用真实素材，呈现更好的你。</p></div><button type="button" class="fire-showcase__reload" :disabled="state === 'loading'" @click="load">重新加载</button></header>
    <div class="fire-showcase__workspace" :aria-busy="state === 'loading'">
      <iframe ref="frameElement" v-if="frameVisible" :key="frameKey" class="fire-showcase__frame" title="展示面工作台" src="/tools/fire-showcase/" referrerpolicy="same-origin" :class="{ 'is-ready': state === 'ready' }" @load="loaded" @error="fail" />
      <div v-if="state === 'loading'" class="fire-showcase__state" role="status"><span class="fire-showcase__spinner" aria-hidden="true" /><strong>正在打开工作台</strong><p>稍等片刻，马上就好。</p></div>
      <div v-else-if="state === 'failed'" class="fire-showcase__state" role="alert"><strong>展示面暂时无法打开</strong><p>请稍后重试，你已有的作品会保留。</p><button type="button" class="fire-showcase__retry" @click="load">重试</button></div>
    </div>
  </main>
</template>

<style scoped>
.fire-showcase { flex: 1; min-width: 0; height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--fire-text, #17191d); background: var(--fire-canvas, #fff); }
.fire-showcase__header { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 22px 28px 20px; border-bottom: 1px solid var(--fire-line, #e5e7eb); }
h1 { font-size: 20px; font-weight: 600; letter-spacing: -.025em; margin: 0; } p { margin: 6px 0 0; font-size: 12px; color: var(--fire-muted, #777); line-height: 1.6; }
button { font: inherit; cursor: pointer; border: 1px solid var(--fire-line, #e5e7eb); border-radius: 8px; background: var(--fire-surface, #fff); color: inherit; padding: 8px 14px; font-size: 12px; } button:disabled { opacity: .45; cursor: default; } button:focus-visible { outline: 2px solid var(--fire-accent, #c91840); outline-offset: 3px; }
.fire-showcase__workspace { flex: 1; min-height: 0; position: relative; }
.fire-showcase__frame { display: block; width: 100%; height: 100%; min-height: 0; border: 0; opacity: 0; } .fire-showcase__frame.is-ready { opacity: 1; }
.fire-showcase__state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 28px; min-height: 200px; box-sizing: border-box; }
.fire-showcase__state strong { font-size: 15px; font-weight: 550; } .fire-showcase__retry { margin-top: 20px; color: #fff; background: var(--fire-accent, #c91840); border-color: transparent; }
.fire-showcase__spinner { width: 22px; height: 22px; margin-bottom: 20px; border: 2px solid var(--fire-line, #e5e7eb); border-top-color: var(--fire-accent, #c91840); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .fire-showcase__spinner { animation: none; } }
@media (max-width: 600px) { .fire-showcase__header { padding: 18px 20px; } }
</style>
