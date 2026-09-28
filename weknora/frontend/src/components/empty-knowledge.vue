<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const emit = defineEmits<{ upload: [] }>()
</script>
<template>
    <button type="button" class="empty-dropzone" @click="emit('upload')">
        <span class="empty-icon" aria-hidden="true">
            <t-icon name="upload" size="20px" />
        </span>
        <span class="empty-txt">{{ $t('knowledgeBase.emptyKnowledgeDragDrop') }}</span>
        <span class="empty-formats">
            <span class="empty-type-txt">{{ $t('knowledgeBase.pdfDocFormat') }}</span>
            <span class="empty-format-separator" aria-hidden="true">·</span>
            <span class="empty-type-txt">{{ $t('knowledgeBase.textMarkdownFormat') }}</span>
        </span>
    </button>
</template>
<style scoped lang="less">
.empty-dropzone {
    flex: 1;
    width: min(420px, calc(100% - 32px));
    min-height: 176px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 28px 24px;
    border: 1px dashed var(--td-component-border);
    border-radius: 10px;
    background: var(--td-bg-color-container);
    color: var(--td-text-color-secondary);
    font: inherit;
    text-align: inherit;
    cursor: pointer;
}

.empty-dropzone:hover,
.empty-dropzone:focus-visible {
    border-color: var(--td-component-stroke);
    outline: none;
}

.empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--td-component-stroke);
    border-radius: 9px;
    color: var(--td-text-color-secondary);
}

.empty-txt {
    color: var(--td-text-color-secondary);
    font-family: var(--app-font-family);
    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
    margin: 10px 0 6px;
}

.empty-formats {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
}

.empty-type-txt {
    color: var(--td-text-color-disabled);
    text-align: center;
    font-family: var(--app-font-family);
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
}

.empty-format-separator {
    color: var(--td-text-color-disabled);
}
</style>
