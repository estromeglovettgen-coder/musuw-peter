<template>
  <header class="market-header">
    <div v-if="back || title || description"><RouterLink v-if="back" class="market-link" to="/platform/marketplace"><t-icon name="chevron-left" />{{ t('creatorMarketplace.back') }}</RouterLink><h1 v-else-if="title">{{ title }}</h1><p v-if="description">{{ description }}</p></div>
    <nav class="market-actions" :aria-label="t('creatorMarketplace.title')">
      <RouterLink v-if="route.name !== 'marketplace' && !back" class="market-link" to="/platform/marketplace">{{ t('creatorMarketplace.browse') }}</RouterLink>
      <RouterLink v-if="route.name !== 'marketplaceOrders'" class="market-link" to="/platform/orders">{{ t('creatorMarketplace.orders') }}</RouterLink>
      <RouterLink v-if="route.name !== 'creatorProducts'" class="market-link" to="/platform/creator-products">{{ t('creatorMarketplace.creator') }}</RouterLink>
      <RouterLink v-if="auth.isSystemAdmin && route.name !== 'marketplaceAdmin'" class="market-link" to="/platform/marketplace-admin">{{ t('creatorMarketplace.admin') }}</RouterLink>
    </nav>
  </header>
</template>
<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
defineProps<{ title?: string; description?: string; back?: boolean }>()
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
</script>
