<template>
  <template v-if="pendingInvitationCount > 0">
    <t-badge :count="pendingInvitationCount" :max-count="99" :offset="[6, 4]"
      class="global-invitation-bell">
      <button type="button" class="global-invitation-bell__btn"
        :title="$t('tenantInvitation.inboxTooltip')" @click="openDialog">
        <t-icon name="notification" size="16px" />
      </button>
    </t-badge>
  </template>
  <MyInvitationsDialog v-model:visible="dialogVisible" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import MyInvitationsDialog from '@/components/MyInvitationsDialog.vue'

const authStore = useAuthStore()
const pendingInvitationCount = computed(() => authStore.pendingInvitationCount)
const dialogVisible = ref(false)
const openDialog = () => { dialogVisible.value = true }
</script>

<style lang="less" scoped>
.global-invitation-bell {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 100;
}

/* Native-only surface: borrow @视觉文件 Sidebar/QAPanel neutral icon-button
   chrome without altering pending-count/dialog behavior. */
.global-invitation-bell__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;

  &:hover {
    border-color: #d1d5db;
    background: #f9fafb;
    color: #111827;
  }

  &:focus-visible {
    outline: 2px solid #d1d5db;
    outline-offset: 2px;
  }
}
</style>
