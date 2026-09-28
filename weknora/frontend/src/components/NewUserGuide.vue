<template>
  <SpotlightGuide v-model:active="active" :steps="steps" step-i18n-prefix="newUserGuide.steps"
    labels-prefix="newUserGuide" @finish="onFinish" @dismiss="onFinish" @step-change="onStepChange" />
  <GlobalInvitationBell v-if="!authStore.isLiteMode" />
  <AgentListContextualGuideBridge v-if="!authStore.isLiteMode" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SpotlightGuide from '@/components/SpotlightGuide.vue'
import GlobalInvitationBell from '@/components/GlobalInvitationBell.vue'
import AgentListContextualGuideBridge from '@/components/AgentListContextualGuideBridge.vue'
import {
  OPEN_NEW_USER_GUIDE_EVENT,
  isGlobalUserGuideDone,
  markGlobalUserGuideDone,
} from '@/config/contextualGuides'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import type { SpotlightGuideStep } from '@/types/spotlightGuide'

const uiStore = useUIStore()
const authStore = useAuthStore()
let settingsOpenedByGuide = false

const steps = computed<SpotlightGuideStep[]>(() => {
  const liteSteps: SpotlightGuideStep[] = [
    { key: 'welcomeLite' },
    {
      key: 'knowledgeLite',
      target: '[data-guide="nav-knowledge-bases"]',
      placement: 'right',
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'agentsLite',
      target: '[data-guide="nav-agents"]',
      placement: 'right',
      optional: true,
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'chatLite',
      target: '[data-guide="nav-creatChat"]',
      placement: 'right',
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'settingsLite',
      target: '[data-guide="user-menu"]',
      placement: 'right',
      before: () => uiStore.expandSidebar(),
    },
    { key: 'doneLite' },
  ]

  const standardSteps: SpotlightGuideStep[] = [
    { key: 'welcome' },
    {
      key: 'knowledge',
      target: '[data-guide="nav-knowledge-bases"]',
      placement: 'right',
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'agents',
      target: '[data-guide="nav-agents"]',
      placement: 'right',
      optional: true,
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'chat',
      target: '[data-guide="nav-creatChat"]',
      placement: 'right',
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'settings',
      target: '[data-guide="user-menu"]',
      placement: 'right',
      before: () => uiStore.expandSidebar(),
    },
    {
      key: 'models',
      target: '[data-guide="settings-add-model"], [data-guide="settings-models"]',
      placement: 'left',
      before: () => {
        uiStore.openSettings('models')
        settingsOpenedByGuide = true
      },
    },
    { key: 'done' },
  ]
  return authStore.isLiteMode ? liteSteps : standardSteps
})

const active = ref(false)

const closeGuideSettings = () => {
  if (settingsOpenedByGuide) {
    uiStore.closeSettings()
    settingsOpenedByGuide = false
  }
}

const onFinish = () => {
  markGlobalUserGuideDone()
  closeGuideSettings()
}

const onStepChange = ({ toKey }: { toKey: string }) => {
  if (toKey !== 'models') {
    closeGuideSettings()
  }
}

const open = () => {
  active.value = true
}

const handleOpenEvent = () => {
  if (active.value) return
  open()
}

onMounted(() => {
  window.addEventListener(OPEN_NEW_USER_GUIDE_EVENT, handleOpenEvent)
  if (!isGlobalUserGuideDone()) {
    window.setTimeout(() => {
      if (!isGlobalUserGuideDone()) {
        open()
      }
    }, 700)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener(OPEN_NEW_USER_GUIDE_EVENT, handleOpenEvent)
  closeGuideSettings()
})
</script>
