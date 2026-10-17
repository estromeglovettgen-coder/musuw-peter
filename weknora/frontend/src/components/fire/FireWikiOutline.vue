<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ target: HTMLElement | null; content: string }>()
const emit = defineEmits<{ graph: [] }>()
const items = ref<{ text: string; level: number; element: HTMLElement }[]>([])
const active = ref(0)
let observer: IntersectionObserver | undefined
let revision = 0
watch([() => props.target, () => props.content], async () => {
  const current = ++revision
  await nextTick()
  if (current !== revision) return
  observer?.disconnect()
  items.value = Array.from(props.target?.querySelectorAll<HTMLElement>('h2, h3') || [])
    .filter(element => element.textContent?.trim())
    .map(element => ({ text: element.textContent!.trim(), level: Number(element.tagName.slice(1)), element }))
  active.value = 0
  if (!items.value.length) return
  observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting)
    if (visible.length) active.value = items.value.findIndex(item => item.element === visible[0].target)
  }, { root: props.target?.closest('.wiki-reader'), rootMargin: '-16px 0px -65% 0px' })
  items.value.forEach(item => observer!.observe(item.element))
}, { immediate: true })
function jump(index: number) {
  active.value = index
  items.value[index]?.element.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}
onBeforeUnmount(() => { revision++; observer?.disconnect() })
</script>

<template>
  <aside class="fire-wiki-outline" aria-label="本页内容">
    <div v-if="items.length" class="fire-wiki-outline__contents"><h3>本页内容</h3><nav><button v-for="(item, index) in items" :key="index" type="button" :class="{ 'is-active': active === index, 'is-child': item.level === 3 }" :aria-current="active === index ? 'location' : undefined" @click="jump(index)">{{ item.text }}</button></nav></div>
    <button type="button" class="fire-wiki-outline__graph" @click="emit('graph')">查看关联图谱 <t-icon name="arrow-right" /></button>
  </aside>
</template>

<style scoped>
.fire-wiki-outline { box-sizing: border-box; flex: 0 0 180px; width: 180px; min-width: 0; padding: 32px 20px; border-left: 1px solid var(--fire-line); overflow-y: auto; color: var(--fire-secondary); }
.fire-wiki-outline h3 { margin: 0 0 20px; font-size: 13px; font-weight: 600; color: var(--fire-text); }
.fire-wiki-outline nav { display: flex; flex-direction: column; border-left: 1px solid var(--fire-line); }
.fire-wiki-outline nav button { display: block; width: 100%; padding: 8px 0 8px 14px; border: 0; border-left: 2px solid transparent; margin-left: -1px; color: var(--fire-muted); background: transparent; text-align: left; font: inherit; font-size: 12px; line-height: 1.7; cursor: pointer; overflow-wrap: anywhere; }
.fire-wiki-outline nav button.is-child { padding-left: 24px; font-size: 11px; }
.fire-wiki-outline nav button:hover { color: var(--fire-text); }
.fire-wiki-outline nav button.is-active { color: var(--fire-link); border-left-color: var(--fire-accent); }
.fire-wiki-outline__graph { display: flex; align-items: center; gap: 8px; padding: 24px 0 0; margin-top: 24px; border: 0; border-top: 1px solid var(--fire-line); width: 100%; font: inherit; font-size: 12px; color: var(--fire-link); background: transparent; cursor: pointer; }
@media (max-width: 1250px) { .fire-wiki-outline { display: none; } }
</style>
