<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fireMembershipApi, type FireUsage } from '@/api/fire-membership'
import { fireError } from '@/utils/fireMembershipFormat'
import FireMembershipCard from '@/components/fire/FireMembershipCard.vue'
import FireUsageTable from '@/components/fire/FireUsageTable.vue'
const auth = useAuthStore(), items = ref<FireUsage[]>([]), total = ref(0), page = ref(1), loading = ref(false), error = ref('')
let sequence = 0
async function load() {
  const request = ++sequence; loading.value = true
  try { const result = await fireMembershipApi.usage(page.value); if (request !== sequence) return; items.value = result.items || []; total.value = result.total; error.value = '' }
  catch (cause) { if (request === sequence) error.value = fireError(cause) }
  finally { if (request === sequence) loading.value = false }
}
watch(() => auth.currentUserId, () => { sequence += 1; items.value = []; total.value = 0; page.value = 1; if (auth.currentUserId) void load() }, { immediate: true })
</script>
<template>
  <main class="fire-usage-page"><header><div><h1>套餐与用量</h1><p>按 Token 计量，缓存输入不重复累加。历史内容始终可以查看。</p></div><t-button variant="outline" :loading="loading" @click="load">刷新明细</t-button></header>
    <FireMembershipCard detailed />
    <h2>调用记录</h2><p class="fire-usage-page__hint">估算用量可能包含中断或未完成的调用，并按预留上限保守结算。</p><p v-if="error" class="fire-usage-page__error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-if="loading && !items.length" role="status">正在读取用量…</p><FireUsageTable v-else :items="items" />
    <t-pagination v-if="total > 20" v-model="page" :total="total" :page-size="20" :show-page-size="false" @current-change="load" />
  </main>
</template>
<style scoped>
.fire-usage-page { flex: 1; overflow: auto; padding: 40px clamp(20px, 4vw, 64px); color: var(--fire-text, #111827); background: var(--fire-canvas, #fff); }
header { display: flex; align-items: start; justify-content: space-between; gap: 20px; margin-bottom: 28px; } h1 { margin: 0; font-size: 26px; font-weight: 600; } header p { color: var(--fire-muted, #6b7280); font-size: 12px; line-height: 1.7; } h2 { margin-top: 30px; font-size: 17px; font-weight: 600; } .fire-usage-page__hint { color: var(--fire-muted, #6b7280); font-size: 11px; line-height: 1.7; } .fire-usage-page__error { color: var(--fire-link, #b7233b); font-size: 13px; } .fire-usage-page__error button { background: transparent; border: 0; text-decoration: underline; color: inherit; cursor: pointer; } :deep(.t-pagination) { margin-top: 18px; } @media(max-width: 640px) { header { flex-wrap: wrap; } }
</style>
