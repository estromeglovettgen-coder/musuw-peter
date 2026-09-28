<template>
  <t-popup
    trigger="click"
    placement="bottom-left"
    :overlay-style="{ padding: 0 }"
    :overlay-inner-style="{
      padding: 0,
      border: '0',
      borderRadius: 0,
      background: 'transparent',
      boxShadow: 'none',
    }"
  >
    <template #content>
      <div class="visual-kb-switcher" role="listbox">
        <button
          v-for="item in sortedList"
          :key="item.id"
          type="button"
          class="visual-kb-switcher__row"
          :class="{ 'is-current': item.id === currentKbId }"
          role="option"
          :aria-selected="item.id === currentKbId"
          @click="handleSelect(item.id)"
        >
          <span class="visual-kb-switcher__icon" aria-hidden="true">
            <t-icon :name="iconFor(item.type)" />
          </span>
          <span class="visual-kb-switcher__name" :title="item.name">{{ item.name }}</span>
          <t-icon v-if="item.id === currentKbId" name="check" class="visual-kb-switcher__check" />
        </button>
        <div v-if="!sortedList.length" class="visual-kb-switcher__empty">{{ t('common.noData') }}</div>
      </div>
    </template>
    <slot />
  </t-popup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface KBEntry {
  id: string
  name: string
  type?: string
}

const props = defineProps<{
  kbList: KBEntry[]
  currentKbId: string
}>()

const emit = defineEmits<{
  (e: 'select', kbId: string): void
}>()

const { t } = useI18n()

const sortedList = computed<KBEntry[]>(() => {
  const all = props.kbList || []
  const current = all.find((kb) => kb.id === props.currentKbId)
  if (!current) return all
  return [current, ...all.filter((kb) => kb.id !== props.currentKbId)]
})

const iconFor = (type?: string): string => type === 'faq' ? 'chat-bubble-help' : 'folder'

const handleSelect = (id: string): void => {
  if (id === props.currentKbId) return
  emit('select', id)
}
</script>

<style scoped lang="less">
.visual-kb-switcher {
  width: 288px;
  max-width: min(288px, calc(100vw - 32px));
  max-height: 256px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  color: #374151;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.visual-kb-switcher__row {
  width: 100%;
  min-height: 36px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.visual-kb-switcher__row:hover,
.visual-kb-switcher__row:focus-visible {
  outline: none;
  background: #f9fafb;
  color: #111827;
}

.visual-kb-switcher__row.is-current {
  background: #f3f4f6;
  color: #111827;
  font-weight: 600;
}

.visual-kb-switcher__icon {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  color: #6b7280;
}

.visual-kb-switcher__icon :deep(.t-icon) { font-size: 13px; }
.visual-kb-switcher__name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-kb-switcher__check { flex: 0 0 12px; font-size: 12px; color: #4b5563; }
.visual-kb-switcher__empty { padding: 8px 12px; color: #9ca3af; font-size: 12px; line-height: 16px; text-align: center; white-space: nowrap; }

@media (min-width: 640px) {
  .visual-kb-switcher__row,
  .visual-kb-switcher__empty {
    font-size: 14px;
    line-height: 20px;
  }
}
</style>
