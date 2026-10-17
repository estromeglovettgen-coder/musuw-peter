<script setup lang="ts">
withDefaults(defineProps<{ markOnly?: boolean }>(), { markOnly: false })
</script>

<template>
  <span class="fire-brand" :class="{ 'fire-brand--mark': markOnly }" :aria-label="markOnly ? undefined : '火种'">
    <span class="fire-brand__mark" aria-hidden="true"><img src="/brand/fire-mark.png" alt="" /></span>
    <span v-if="!markOnly" class="fire-brand__wordmark"><strong>火种</strong><small>FIRE CONSULTING</small></span>
  </span>
</template>

<style scoped>
.fire-brand { display: inline-flex; align-items: center; gap: 10px; flex: none; color: var(--fire-text, #f2f0f0); }
.fire-brand__mark { display: flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 46px; overflow: hidden; }
.fire-brand__mark img { display: block; width: 158%; height: 158%; max-width: none; object-fit: contain; flex: none; }
.fire-brand__wordmark { display: flex; flex-direction: column; gap: 4px; text-align: left; }
.fire-brand__wordmark strong { font-size: 21px; line-height: 1.2; font-weight: 650; letter-spacing: .08em; }
.fire-brand__wordmark small { color: var(--fire-muted, #a2a2ac); font-size: 8px; line-height: 1.25; letter-spacing: .12em; white-space: nowrap; }
.fire-brand--mark .fire-brand__mark { width: 24px; height: 32px; }
</style>
