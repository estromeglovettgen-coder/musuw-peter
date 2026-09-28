<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import DocumentPreview from '@/components/document-preview.vue'
import { useChatAttachmentPreviewDrawer } from '@/composables/useChatAttachmentPreviewDrawer'

const drawer = useChatAttachmentPreviewDrawer()

const MAIN_DRAWER_WIDTH_KEY = 'weknora-chat-attachment-drawer-width'
const MAIN_DRAWER_DEFAULT_WIDTH = 654
const MAIN_DRAWER_MIN_WIDTH = 480

const mainDrawerWidth = ref(MAIN_DRAWER_DEFAULT_WIDTH)
const mainDrawerResizing = ref(false)

let mainResizeStartX = 0
let mainResizeStartWidth = 0

const visible = computed(() => drawer?.visible.value ?? false)
const target = computed(() => drawer?.target.value ?? null)

function mainDrawerMaxWidth() {
  return Math.min(1600, Math.max(MAIN_DRAWER_MIN_WIDTH, Math.floor(window.innerWidth * 0.95)))
}

function clampMainDrawerWidth(width: number) {
  return Math.max(MAIN_DRAWER_MIN_WIDTH, Math.min(mainDrawerMaxWidth(), width))
}

function loadMainDrawerWidth() {
  try {
    const raw = localStorage.getItem(MAIN_DRAWER_WIDTH_KEY)
    const parsed = raw ? parseInt(raw, 10) : NaN
    if (!Number.isNaN(parsed)) mainDrawerWidth.value = clampMainDrawerWidth(parsed)
  } catch {
    /* ignore */
  }
}

function onMainDrawerResizeStart(e: MouseEvent) {
  mainDrawerResizing.value = true
  mainResizeStartX = e.clientX
  mainResizeStartWidth = mainDrawerWidth.value
  document.addEventListener('mousemove', onMainDrawerResizeMove)
  document.addEventListener('mouseup', onMainDrawerResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onMainDrawerResizeMove(e: MouseEvent) {
  const delta = mainResizeStartX - e.clientX
  mainDrawerWidth.value = clampMainDrawerWidth(mainResizeStartWidth + delta)
}

function onMainDrawerResizeEnd() {
  document.removeEventListener('mousemove', onMainDrawerResizeMove)
  document.removeEventListener('mouseup', onMainDrawerResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  mainDrawerResizing.value = false
  try {
    localStorage.setItem(MAIN_DRAWER_WIDTH_KEY, String(mainDrawerWidth.value))
  } catch {
    /* ignore */
  }
}

function cleanupMainDrawerResize() {
  document.removeEventListener('mousemove', onMainDrawerResizeMove)
  document.removeEventListener('mouseup', onMainDrawerResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  mainDrawerResizing.value = false
}

function onWindowResize() {
  mainDrawerWidth.value = clampMainDrawerWidth(mainDrawerWidth.value)
}

function close() {
  drawer?.close()
}

onMounted(() => {
  loadMainDrawerWidth()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  cleanupMainDrawerResize()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="visual-attachment-preview">
      <div v-if="visible" class="visual-attachment-preview__overlay" @click.self="close">
        <div
          class="visual-attachment-preview__resize-handle"
          :class="{ 'is-active': mainDrawerResizing }"
          :style="{ right: `${mainDrawerWidth}px` }"
          role="separator"
          aria-orientation="vertical"
          @mousedown.prevent="onMainDrawerResizeStart"
        >
          <span />
        </div>

        <aside
          class="visual-attachment-preview"
          :class="{ 'is-resizing': mainDrawerResizing }"
          :style="{ width: `${mainDrawerWidth}px` }"
          role="dialog"
          aria-modal="true"
          :aria-label="target?.fileName || ''"
        >
          <header class="visual-attachment-preview__header">
            <span class="visual-attachment-preview__icon" aria-hidden="true"><t-icon name="file" /></span>
            <strong :title="target?.fileName || ''">{{ target?.fileName || '' }}</strong>
            <button type="button" class="visual-attachment-preview__close" :aria-label="$t('common.close')" @click="close">
              <t-icon name="close" />
            </button>
          </header>

          <section v-if="target" class="visual-attachment-preview__body">
            <DocumentPreview
              :key="`${target.sessionId}:${target.attachmentId}`"
              :session-id="target.sessionId"
              :attachment-id="target.attachmentId"
              :file-type="target.fileType"
              :file-name="target.fileName"
              :active="visible"
              fill-height
            />
          </section>
        </aside>

        <div v-if="mainDrawerResizing" class="visual-attachment-preview__resize-shield" aria-hidden="true" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.visual-attachment-preview__overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgb(15 23 42 / 14%);
}

.visual-attachment-preview {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  max-width: 95vw;
  min-width: 480px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: -18px 0 50px rgb(15 23 42 / 12%);
}

.visual-attachment-preview__header {
  flex: 0 0 auto;
  min-height: 58px;
  padding: 12px 16px;
  box-sizing: border-box;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  gap: 9px;
}

.visual-attachment-preview__icon {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #6b7280;
}

.visual-attachment-preview__icon :deep(.t-icon) { font-size: 14px; }

.visual-attachment-preview__header strong {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: #111827;
  font-size: 12px;
  line-height: 18px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-attachment-preview__close {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 6px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}

.visual-attachment-preview__close:hover {
  background: #f3f4f6;
  color: #374151;
}

.visual-attachment-preview__body {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px 12px 12px;
  box-sizing: border-box;
}

.visual-attachment-preview__resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2003;
  width: 12px;
  margin-right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
}

.visual-attachment-preview__resize-handle > span {
  width: 2px;
  height: 46px;
  border-radius: 999px;
  background: #d1d5db;
  opacity: .6;
}

.visual-attachment-preview__resize-handle:hover > span,
.visual-attachment-preview__resize-handle.is-active > span {
  background: #6b7280;
  opacity: 1;
}

.visual-attachment-preview__resize-shield {
  position: fixed;
  inset: 0;
  z-index: 2002;
  cursor: col-resize;
}

.visual-attachment-preview.is-resizing .visual-attachment-preview__body {
  pointer-events: none;
  user-select: none;
}

.visual-attachment-preview-enter-active,
.visual-attachment-preview-leave-active {
  transition: opacity 150ms ease;
}

.visual-attachment-preview-enter-from,
.visual-attachment-preview-leave-to { opacity: 0; }

@media (max-width: 520px) {
  .visual-attachment-preview {
    width: 100% !important;
    min-width: 0;
    max-width: 100%;
  }
  .visual-attachment-preview__resize-handle { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .visual-attachment-preview-enter-active,
  .visual-attachment-preview-leave-active { transition: none !important; }
}
</style>
