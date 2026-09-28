<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  dialogLabel: string
  contentLabel?: string
  routeMode?: boolean
  contentWide?: boolean
  contentFull?: boolean
  modalClass?: string
  contentClass?: string
}>(), {
  contentLabel: '',
  routeMode: false,
  contentWide: false,
  contentFull: false,
  modalClass: '',
  contentClass: '',
})

const emit = defineEmits<{
  close: []
}>()

const slots = useSlots()
const dialogRef = ref<HTMLElement | null>(null)
const hasFooter = computed(() => Boolean(slots.footer))
let lastFocusedElement: HTMLElement | null = null

const handleDialogTab = (event: KeyboardEvent) => {
  const dialog = dialogRef.value
  if (!dialog) return
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.visible, (isVisible, wasVisible) => {
  if (isVisible && !wasVisible) {
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void nextTick(() => dialogRef.value?.focus())
  } else if (!isVisible && wasVisible) {
    void nextTick(() => {
      lastFocusedElement?.focus()
      lastFocusedElement = null
    })
  }
}, { immediate: true })

onBeforeUnmount(() => {
  lastFocusedElement?.focus()
  lastFocusedElement = null
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="visual-settings-overlay" :class="{ 'is-route': routeMode }" @click.self="emit('close')">
      <section
        ref="dialogRef"
        class="visual-settings-modal"
        :class="modalClass"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogLabel"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
        @keydown.esc.prevent.stop="emit('close')"
      >
        <aside class="visual-settings-sidebar">
          <div class="visual-settings-close-wrap">
            <button type="button" class="visual-settings-close" :aria-label="$t('general.close')" :title="$t('general.close')" @click="emit('close')">
              <t-icon name="close" aria-hidden="true" />
            </button>
          </div>
          <nav class="visual-settings-nav" :aria-label="dialogLabel">
            <slot name="nav" />
          </nav>
        </aside>

        <main class="visual-settings-content" :class="[{ 'has-footer': hasFooter }, contentClass]" :aria-label="contentLabel || dialogLabel">
          <div class="visual-settings-content__inner" :class="{ 'is-wide': contentWide, 'is-full': contentFull }">
            <slot />
          </div>
          <footer v-if="hasFooter" class="visual-settings-footer">
            <slot name="footer" />
          </footer>
        </main>
      </section>
    </div>
  </Teleport>
</template>

<style lang="less">
.visual-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 12px;
  background: rgb(0 0 0 / 50%);
  backdrop-filter: blur(4px);
  user-select: none;
}

.visual-settings-modal {
  position: relative;
  width: min(896px, 100%);
  height: 620px;
  max-height: 92vh;
  min-width: 0;
  display: flex;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  background: #fff;
  color: #242424;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 25%);
  text-align: left;
}

.visual-settings-sidebar {
  flex: 0 0 192px;
  width: 192px;
  min-width: 0;
  box-sizing: border-box;
  padding: 16px 12px 12px;
  border-right: 1px solid #f3f4f6;
  background: #fafafa;
  display: flex;
  flex-direction: column;
}

.visual-settings-close-wrap { padding: 0 4px 12px; }
.visual-settings-close {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  transition: all 150ms ease;
}
.visual-settings-close:hover { background: #f3f4f6; color: #111827; }
.visual-settings-close:focus-visible { outline: 2px solid #8bbcff; outline-offset: 2px; }
.visual-settings-close .t-icon { width: 14px; height: 14px; font-size: 14px; }

.visual-settings-nav {
  min-height: 0;
  flex: 1 1 auto;
  padding-right: 2px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: thin;
}

.visual-settings-nav__item {
  width: 100%;
  min-height: 0;
  padding: 10px 14px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  background: transparent;
  color: #4b5563;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.visual-settings-nav__item > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-settings-nav__item:hover { background: rgb(243 244 246 / 70%); color: #111827; }
.visual-settings-nav__item.is-active { background: #fff; color: #111827; font-weight: 700; border: 1px solid rgb(229 231 235 / 80%); box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-settings-nav__item:focus-visible { outline: 2px solid #8bbcff; outline-offset: -2px; }
.visual-settings-nav__empty { margin: 12px 10px; color: #8b8b8b; font-size: 12px; line-height: 18px; }

.visual-settings-content {
  min-width: 0;
  flex: 1 1 auto;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  padding: 24px;
  background: #fff;
  user-select: text;
}
.visual-settings-content__inner { width: 100%; min-width: 0; max-width: none; margin: 0 auto; box-sizing: border-box; }
.visual-settings-content__inner.is-wide,
.visual-settings-content__inner.is-full { width: 100%; max-width: none; }
.visual-settings-content.has-footer { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.visual-settings-content.has-footer > .visual-settings-content__inner { min-height: 0; flex: 1 1 auto; overflow: hidden; }
.visual-settings-footer {
  min-height: 64px;
  flex: 0 0 auto;
  padding: 12px 32px;
  box-sizing: border-box;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  background: #fff;
}

.visual-settings-content .visual-settings-page-header,
.visual-settings-content .section-header {
  margin: 0 0 8px !important;
  padding: 0 0 12px !important;
  border-bottom: 1px solid #f3f4f6 !important;
  background: transparent !important;
}
.visual-settings-content .visual-settings-page-header__copy { min-width: 0 !important; }
.visual-settings-content .visual-settings-page-header__title,
.visual-settings-content .section-header h2 {
  margin: 0 !important;
  color: #111827 !important;
  font-size: 16px !important;
  line-height: 24px !important;
  font-weight: 700 !important;
  letter-spacing: normal !important;
}
.visual-settings-content .visual-settings-page-header__description,
.visual-settings-content .section-description {
  margin: 2px 0 0 !important;
  color: #9ca3af !important;
  font-size: 12px !important;
  line-height: 16px !important;
}
.visual-settings-content .usage-billing__group,
.visual-settings-content .settings-group {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible;
}
.visual-settings-content .usage-billing__row,
.visual-settings-content .setting-row {
  min-height: 0 !important;
  margin: 0 !important;
  padding: 14px 0 !important;
  border-bottom: 1px solid #f3f4f6 !important;
}
.visual-settings-content .setting-row:last-child { border-bottom: 0 !important; }

.visual-settings-role-denied { min-height: 300px; display: flex; align-items: center; justify-content: center; color: #d1d5db; }
.visual-settings-role-denied > .t-icon { font-size: 32px; }

@media (max-width: 720px) {
  .visual-settings-overlay { padding: 12px; }
  .visual-settings-modal { max-height: calc(100dvh - 24px); }
  .visual-settings-sidebar { flex-basis: 192px; width: 192px; padding: 16px 12px 12px; }
  .visual-settings-content { padding: 24px; }
  .visual-settings-content.has-footer { padding: 0; }
}
@media (min-width: 640px) {
  .visual-settings-overlay { padding: 16px; }
  .visual-settings-content { padding: 32px; }
  .visual-settings-content.has-footer { padding: 0; }
}
@media (min-width: 1024px) {
  .visual-settings-modal { width: min(1024px, 100%); }
}
@media (max-width: 560px) {
  .visual-settings-overlay { align-items: stretch; padding: 0; }
  .visual-settings-modal { width: 100%; height: 100%; max-height: none; flex-direction: column; border: 0; border-radius: 0; }
  .visual-settings-sidebar { width: 100%; flex: 0 0 auto; max-height: 194px; padding: 12px; border-right: 0; border-bottom: 1px solid #e4e4e2; }
  .visual-settings-nav { flex-direction: row; overflow-x: auto; overflow-y: hidden; gap: 4px; padding-right: 0; }
  .visual-settings-nav__item { flex: 0 0 auto; width: auto; }
  .visual-settings-nav__empty { margin: 8px 4px; }
  .visual-settings-content { padding: 24px; }
  .visual-settings-content.has-footer { padding: 0; }
  .visual-settings-content .section-header h2 { font-size: 16px !important; line-height: 24px !important; }
}

@media (prefers-color-scheme: dark) {
  :root:not([theme-mode="light"]) .visual-settings-modal,
  :root:not([theme-mode="light"]) .visual-settings-content,
  :root:not([theme-mode="light"]) .visual-settings-footer { border-color: #27272a; background: #18181b; color: #f4f4f5; }
  :root:not([theme-mode="light"]) .visual-settings-sidebar { border-color: rgb(39 39 42 / 80%); background: rgb(9 9 11 / 60%); }
  :root:not([theme-mode="light"]) .visual-settings-close { border-color: #3f3f46; background: #27272a; color: #a1a1aa; }
  :root:not([theme-mode="light"]) .visual-settings-close:hover { background: #3f3f46; color: #fff; }
  :root:not([theme-mode="light"]) .visual-settings-nav__empty { color: #a1a1aa; }
  :root:not([theme-mode="light"]) .visual-settings-nav__item:hover { background: rgb(39 39 42 / 50%); color: #fff; }
  :root:not([theme-mode="light"]) .visual-settings-nav__item { color: #a1a1aa; }
  :root:not([theme-mode="light"]) .visual-settings-nav__item.is-active { border-color: #3f3f46; background: #27272a; color: #fff; }
}
:root[theme-mode="dark"] .visual-settings-modal,
:root[theme-mode="dark"] .visual-settings-content,
:root[theme-mode="dark"] .visual-settings-footer { border-color: #27272a; background: #18181b; color: #f4f4f5; }
:root[theme-mode="dark"] .visual-settings-sidebar { border-color: rgb(39 39 42 / 80%); background: rgb(9 9 11 / 60%); }
:root[theme-mode="dark"] .visual-settings-close { border-color: #3f3f46; background: #27272a; color: #a1a1aa; }
:root[theme-mode="dark"] .visual-settings-close:hover { background: #3f3f46; color: #fff; }
:root[theme-mode="dark"] .visual-settings-nav__empty { color: #a1a1aa; }
:root[theme-mode="dark"] .visual-settings-nav__item:hover { background: rgb(39 39 42 / 50%); color: #fff; }
:root[theme-mode="dark"] .visual-settings-nav__item { color: #a1a1aa; }
:root[theme-mode="dark"] .visual-settings-nav__item.is-active { border-color: #3f3f46; background: #27272a; color: #fff; }
:root[theme-mode="dark"] .visual-settings-content .visual-settings-page-header,
:root[theme-mode="dark"] .visual-settings-content .section-header {
  border-bottom-color: #27272a !important;
}
:root[theme-mode="dark"] .visual-settings-content h2.visual-settings-page-header__title,
:root[theme-mode="dark"] .visual-settings-content .section-header h2 {
  color: #fff !important;
}
:root[theme-mode="dark"] .visual-settings-content .visual-settings-page-header__description,
:root[theme-mode="dark"] .visual-settings-content .section-description {
  color: #a1a1aa !important;
}
:root[theme-mode="dark"] .visual-settings-footer {
  border-top-color: #27272a !important;
  background: #18181b !important;
  color: #f4f4f5 !important;
}
:root[theme-mode="dark"] .visual-settings-content .usage-billing__group,
:root[theme-mode="dark"] .visual-settings-content .settings-group { border-color: transparent !important; background: transparent !important; }
:root[theme-mode="dark"] .visual-settings-content .usage-billing__row,
:root[theme-mode="dark"] .visual-settings-content .setting-row,
:root[theme-mode="dark"] .visual-settings-content .usage-billing__group h3 { border-bottom-color: #27272a !important; }
:root[theme-mode="dark"] .visual-settings-content h2,
:root[theme-mode="dark"] .visual-settings-content h3,
:root[theme-mode="dark"] .visual-settings-content label,
:root[theme-mode="dark"] .visual-settings-content strong,
:root[theme-mode="dark"] .visual-settings-content .info-value { color: #e4e4e7 !important; }
:root[theme-mode="dark"] .visual-settings-content p,
:root[theme-mode="dark"] .visual-settings-content small,
:root[theme-mode="dark"] .visual-settings-content .desc { color: #a1a1aa !important; }
@media (prefers-reduced-motion: reduce) { .visual-settings-nav__item { transition: none !important; } }
</style>
