<template>
  <div class="visual-session-filter" :class="{ 'is-inline': inline, 'is-emphasized': emphasized }">
    <button
      ref="triggerRef"
      type="button"
      class="visual-session-filter__trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click.stop="toggleOpen"
    >
      <span class="visual-session-filter__leading">
        <img
          v-if="currentOption?.logo"
          :src="currentOption.logo"
          :alt="currentOption.label"
          class="visual-session-filter__logo"
        />
        <t-icon v-else :name="iconFor(currentOption)" class="visual-session-filter__icon" />
        <span class="visual-session-filter__label" :title="currentOption?.label">{{ currentOption?.label }}</span>
      </span>
      <t-icon
        name="chevron-down"
        class="visual-session-filter__chevron"
        :class="{ 'is-open': open }"
      />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="visual-session-filter__panel"
        role="listbox"
        :style="panelStyle"
        @click.stop
      >
        <button
          v-for="item in sources"
          :key="item.value"
          type="button"
          class="visual-session-filter__option"
          :class="{ 'is-active': item.value === current }"
          role="option"
          :aria-selected="item.value === current"
          @click="handleSelect(item.value)"
        >
          <span class="visual-session-filter__option-leading">
            <img v-if="item.logo" :src="item.logo" :alt="item.label" class="visual-session-filter__logo" />
            <t-icon v-else :name="iconFor(item)" class="visual-session-filter__icon" />
            <span class="visual-session-filter__option-label" :title="item.label">{{ item.label }}</span>
          </span>
          <t-icon name="check" class="visual-session-filter__check" :class="{ 'is-visible': item.value === current }" />
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { DEFAULT_SESSION_BUCKET_KEY } from './sessionSidebarSourceFilter'

interface SourceItem {
  value: string
  label: string
  logo?: string
}

const props = defineProps<{
  sources: SourceItem[]
  current: string
  /** 列表顶部的轻量文字触发器（无图标，右对齐） */
  inline?: boolean
  /** 非默认来源时始终显示（便于切回网页对话） */
  emphasized?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', value: string): void
}>()

const PANEL_GAP = 4
const VIEWPORT_MARGIN = 8

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const currentOption = computed(() =>
  props.sources.find((item) => item.value === props.current) ?? props.sources[0],
)

const iconFor = (item: SourceItem | undefined): string => {
  if (!item) return 'chat'
  if (item.value === DEFAULT_SESSION_BUCKET_KEY) return 'chat'
  if (item.value === 'api') return 'server'
  if (item.value.startsWith('embed:')) return 'code'
  return 'link'
}

const updatePanelPosition = (): void => {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  if (props.inline) {
    panelStyle.value = {
      top: `${rect.bottom + PANEL_GAP}px`,
      right: `${Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right)}px`,
      left: 'auto',
    }
    return
  }
  const panelWidth = Math.min(
    Math.max(rect.width, 108),
    window.innerWidth - VIEWPORT_MARGIN * 2,
  )
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - panelWidth - VIEWPORT_MARGIN),
  )
  panelStyle.value = {
    top: `${rect.bottom + PANEL_GAP}px`,
    left: `${left}px`,
    right: 'auto',
    minWidth: `${panelWidth}px`,
  }
}

const removeListeners = (): void => {
  document.removeEventListener('click', close)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', close, true)
}

const close = (): void => {
  open.value = false
  removeListeners()
}

const toggleOpen = (): void => {
  if (open.value) {
    close()
    return
  }
  updatePanelPosition()
  open.value = true
  nextTick(() => {
    document.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
  })
}

const handleSelect = (value: string): void => {
  close()
  if (value === props.current) return
  emit('select', value)
}

onBeforeUnmount(() => {
  removeListeners()
})
</script>

<style scoped lang="less">
.visual-session-filter {
  min-width: 0;
  max-width: 100%;
}

.visual-session-filter__trigger {
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}

.visual-session-filter__trigger:hover,
.visual-session-filter__trigger[aria-expanded='true'] {
  background: #f3f4f6;
  color: #374151;
}

.visual-session-filter.is-emphasized .visual-session-filter__trigger {
  color: #374151;
}

.visual-session-filter.is-inline .visual-session-filter__trigger {
  width: auto;
  max-width: 100%;
  min-height: 24px;
  margin-left: auto;
  padding: 3px 6px;
  border-radius: 7px;
  justify-content: flex-end;
  color: #9ca3af;
}

.visual-session-filter.is-inline .visual-session-filter__trigger:hover,
.visual-session-filter.is-inline .visual-session-filter__trigger[aria-expanded='true'] {
  background: #f9fafb;
  color: #6b7280;
}

.visual-session-filter__leading,
.visual-session-filter__option-leading {
  min-width: 0;
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.visual-session-filter.is-inline .visual-session-filter__leading {
  flex: 0 1 auto;
  gap: 4px;
}

.visual-session-filter__label,
.visual-session-filter__option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}

.visual-session-filter__logo {
  flex: 0 0 13px;
  width: 13px;
  height: 13px;
  object-fit: contain;
  opacity: .8;
}

.visual-session-filter.is-inline .visual-session-filter__logo {
  flex-basis: 12px;
  width: 12px;
  height: 12px;
}

.visual-session-filter__icon {
  flex: 0 0 13px;
  width: 13px;
  height: 13px;
  font-size: 13px;
  color: #9ca3af;
}

.visual-session-filter__chevron {
  flex: 0 0 11px;
  width: 11px;
  height: 11px;
  font-size: 11px;
  color: #9ca3af;
  transition: transform 150ms ease;
}

.visual-session-filter__chevron.is-open {
  transform: rotate(180deg);
}
</style>

<style lang="less">
.visual-session-filter__panel {
  position: fixed;
  z-index: 3000;
  width: max-content;
  min-width: 132px;
  max-width: min(220px, calc(100vw - 16px));
  padding: 5px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 30px rgb(0 0 0 / 12%);
}

.visual-session-filter__option {
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 6px 7px;
  box-sizing: border-box;
  border: 0;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  background: transparent;
  color: #4b5563;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.visual-session-filter__option:hover {
  background: #f3f4f6;
  color: #111827;
}

.visual-session-filter__option.is-active {
  background: #f9fafb;
  color: #111827;
  font-weight: 600;
}

.visual-session-filter__option-leading {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.visual-session-filter__option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
}

.visual-session-filter__check {
  flex: 0 0 13px;
  width: 13px;
  height: 13px;
  font-size: 13px;
  color: #6b7280;
  visibility: hidden;
}

.visual-session-filter__check.is-visible {
  visibility: visible;
}
</style>
