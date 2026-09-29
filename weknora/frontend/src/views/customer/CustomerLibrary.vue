<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isPeterWorkspace } from '@/config/workspaceSurface'
import KnowledgeBaseList from '@/views/knowledge/KnowledgeBaseList.vue'
import CustomerList from './CustomerList.vue'
import './customer.css'
const route = useRoute()
const router = useRouter()
watch(() => route.query.type, type => {
  if (isPeterWorkspace && type === 'customer') void router.replace('/platform/customers')
}, { immediate: true })
</script>
<template>
  <div class="customer-library">
    <nav v-if="isPeterWorkspace" class="customer-library-tabs" aria-label="工作区">
      <router-link to="/platform/knowledge-bases" :class="{active: route.name === 'knowledgeBaseList'}"><t-icon name="folder"/>知识库</router-link>
      <router-link to="/platform/customers" :class="{active: route.name === 'customerList'}"><t-icon name="usergroup"/>客户</router-link>
    </nav>
    <CustomerList v-if="isPeterWorkspace && route.name === 'customerList'"/>
    <KnowledgeBaseList v-else/>
  </div>
</template>
