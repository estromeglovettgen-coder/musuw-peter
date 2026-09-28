<template>
  <ContextualGuide tour="agentList" :when="shouldShowGuide" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ContextualGuide from '@/components/ContextualGuide.vue'
import { useAuthStore } from '@/stores/auth'
import { useChatResourcesStore } from '@/stores/chatResources'
import { useOrganizationStore } from '@/stores/organization'
import { useTenantModelReadiness } from '@/composables/useTenantModelReadiness'

const route = useRoute()
const authStore = useAuthStore()
const chatResources = useChatResourcesStore()
const orgStore = useOrganizationStore()
const { loaded: modelsReadyLoaded, isReadyForAgent } = useTenantModelReadiness()

// AgentEditorModal is teleported to <body> and uses the native `.settings-overlay`
// root. Observe that presentation state instead of duplicating editor business
// state outside AgentList.vue. This bridge never writes app/store data.
const editorOverlayVisible = ref(false)
let observer: MutationObserver | null = null

const syncEditorOverlay = () => {
  editorOverlayVisible.value = Boolean(document.querySelector('.settings-overlay'))
}

onMounted(() => {
  syncEditorOverlay()
  observer = new MutationObserver(syncEditorOverlay)
  observer.observe(document.body, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const effectiveScope = computed(() => {
  const raw = typeof route.query.scope === 'string' ? route.query.scope : ''
  if (raw) return raw
  return authStore.hasRole('contributor') ? 'mine' : 'all'
})

const listLoaded = computed(() =>
  route.name === 'agentList' &&
  chatResources.isFresh('agents') &&
  !orgStore.loading,
)

const nativeListEmpty = computed(() => {
  if (!authStore.hasRole('contributor')) return false
  if (effectiveScope.value === 'mine') return chatResources.agents.length === 0
  if (effectiveScope.value === 'all') {
    return chatResources.agents.length === 0 && orgStore.sharedAgents.length === 0
  }
  // Official AgentList only auto-opens the contextual guide for its all/mine
  // empty states; favorites/recents/per-organization empty states do not qualify.
  return false
})

// Mechanical restoration of WeKnora main 81142df:
// showAgentListEmpty && isReadyForAgent && !editorVisible.
const shouldShowGuide = computed(() =>
  listLoaded.value &&
  nativeListEmpty.value &&
  modelsReadyLoaded.value &&
  isReadyForAgent.value &&
  !editorOverlayVisible.value,
)
</script>
