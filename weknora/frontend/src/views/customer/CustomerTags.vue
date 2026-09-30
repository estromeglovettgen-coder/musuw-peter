<script setup lang="ts">
defineProps<{ tags: string[] }>()
</script>

<template>
  <div class="customer-tags" @click.stop>
    <t-tag
      v-for="tag in tags.slice(0, 3)"
      :key="tag"
      size="small"
      variant="light-outline"
      shape="round"
      max-width="140px"
      class="customer-tag-chip"
      :title="tag"
    >
      <span class="customer-tag-text">{{ tag }}</span>
    </t-tag>
    <t-popup
      v-if="tags.length > 3"
      trigger="click"
      placement="bottom-left"
      overlay-class-name="customer-tags-popover"
      :overlay-inner-style="{ padding: '10px' }"
    >
      <button type="button" class="customer-tag-overflow" :aria-label="`查看全部 ${tags.length} 个客户标签`">
        +{{ tags.length - 3 }}
      </button>
      <template #content>
        <div class="customer-tags-popover__list">
          <t-tag v-for="tag in tags" :key="tag" size="small" variant="light-outline" shape="round" :title="tag">
            {{ tag }}
          </t-tag>
        </div>
      </template>
    </t-popup>
    <span v-if="!tags.length" class="customer-muted">—</span>
  </div>
</template>
