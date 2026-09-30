<script setup lang="ts">
defineProps<{ text: string; label?: string }>()
</script>

<template>
  <t-tooltip :content="text" placement="top">
    <button type="button" class="peter-term-help" :aria-label="label ? `${label}：${text}` : text">
      <t-icon name="help-circle" aria-hidden="true" />
    </button>
  </t-tooltip>
</template>

<style scoped>
.peter-term-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--td-text-color-placeholder);
  cursor: help;
  vertical-align: middle;
}
.peter-term-help:hover { color: var(--td-text-color-primary); }
.peter-term-help:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
</style>
