<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getKnowledgeBaseById } from '@/api/knowledge-base'
import KnowledgeBase from '@/views/knowledge/KnowledgeBase.vue'
import { isPeterWorkspace } from '@/config/workspaceSurface'
import './customer.css'

const route = useRoute()
const router = useRouter()
const resolving = ref(isPeterWorkspace)
let sequence = 0

// Existing bookmarks and source links open customer content inside its own shell.
watch(() => route.params.kbId, async value => {
  const run = ++sequence
  resolving.value = isPeterWorkspace
  if (!isPeterWorkspace || !value) return
  try {
    const response: any = await getKnowledgeBaseById(String(value))
    if (run !== sequence) return
    if (response.data?.customer_profile) {
      await router.replace({
        name: 'customerProject',
        params: { kbId: String(value) },
        query: { ...route.query, tab: route.query.tab || 'documents' },
        hash: route.hash,
      })
      return
    }
  } catch {
    // The native detail view owns inaccessible / deleted library errors.
  }
  if (run === sequence) resolving.value = false
}, { immediate: true })

onBeforeUnmount(() => { sequence++ })
</script>

<template>
  <div class="customer-native">
    <div v-if="resolving" class="customer-empty"><t-loading text="正在打开…" /></div>
    <KnowledgeBase v-else :key="String(route.params.kbId)" />
  </div>
</template>
