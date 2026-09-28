<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
<template>
  <div class="visual-upload-drop-mask">
    <div class="visual-upload-drop-mask__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v12" />
        <path d="m17 8-5-5-5 5" />
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      </svg>
    </div>
    <div class="visual-upload-drop-mask__copy">
      <strong>{{ $t('file.upload') }}</strong>
      <span>{{ $t('knowledgeBase.pdfDocFormat') }}</span>
      <span>{{ $t('knowledgeBase.textMarkdownFormat') }}</span>
    </div>
  </div>
</template>
<style scoped lang="less">
.visual-upload-drop-mask {
  width: min(520px, calc(100vw - 48px));
  min-height: 220px;
  padding: 32px;
  box-sizing: border-box;
  border: 2px dashed #d1d5db;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgb(249 250 251 / 92%);
  color: #374151;
  text-align: center;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 5%), 0 2px 4px -2px rgb(0 0 0 / 5%);
}

.visual-upload-drop-mask__icon {
  width: 48px;
  height: 48px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #374151;
}

.visual-upload-drop-mask__icon svg {
  width: 24px;
  height: 24px;
  display: block;
}

.visual-upload-drop-mask__copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.visual-upload-drop-mask__copy strong {
  color: #111827;
  font-family: var(--app-font-family);
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
}

.visual-upload-drop-mask__copy span {
  color: #9ca3af;
  font-family: var(--app-font-family);
  font-size: 11px;
  line-height: 17px;
  font-weight: 400;
}
</style>
