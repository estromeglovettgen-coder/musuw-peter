<template>
  <SpotlightGuide v-model:active="active" :steps="guideSteps" :step-i18n-prefix="config.stepI18nPrefix"
    labels-prefix="contextualGuide" @finish="onFinish" @dismiss="onFinish" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SpotlightGuide from '@/components/SpotlightGuide.vue'
import {
  CONTEXTUAL_GUIDE_TOURS,
  isContextualGuideDone,
  isGlobalUserGuideDone,
  markContextualGuideDone,
  type ContextualGuideTourConfig,
  type ContextualGuideTourId,
} from '@/config/contextualGuides'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  tour: ContextualGuideTourId
  /** 为 true 且未完成过该情境引导时，在满足全局引导已结束后自动打开 */
  when: boolean
}>()

const config: ContextualGuideTourConfig = CONTEXTUAL_GUIDE_TOURS[props.tour]
const active = ref(false)
const authStore = useAuthStore()

const guideSteps = computed(() => {
  if (props.tour !== 'kbList' || !authStore.isLiteMode) return config.steps
  return config.steps.map((step) => step.key === 'create' ? { ...step, key: 'createLite' } : step)
})

let openTimer: ReturnType<typeof setTimeout> | null = null
let waitGlobalTimer: ReturnType<typeof setTimeout> | null = null

const clearTimers = () => {
  if (openTimer) {
    clearTimeout(openTimer)
    openTimer = null
  }
  if (waitGlobalTimer) {
    clearTimeout(waitGlobalTimer)
    waitGlobalTimer = null
  }
}

const tryOpen = () => {
  if (active.value) return
  if (!props.when) return
  if (isContextualGuideDone(props.tour)) return
  if (!isGlobalUserGuideDone()) return

  openTimer = setTimeout(() => {
    if (!props.when || isContextualGuideDone(props.tour) || active.value) return
    active.value = true
  }, config.openDelayMs)
}

const scheduleOpen = () => {
  clearTimers()
  if (!props.when || isContextualGuideDone(props.tour)) return

  if (isGlobalUserGuideDone()) {
    tryOpen()
    return
  }

  // 等待全局新手引导结束后再展示情境引导，避免两层遮罩叠加
  const poll = () => {
    if (!props.when || isContextualGuideDone(props.tour)) {
      clearTimers()
      return
    }
    if (isGlobalUserGuideDone()) {
      waitGlobalTimer = null
      tryOpen()
      return
    }
    waitGlobalTimer = setTimeout(poll, 400)
  }
  waitGlobalTimer = setTimeout(poll, 400)
}

const onFinish = () => {
  markContextualGuideDone(props.tour)
}

watch(
  () => props.when,
  (val) => {
    if (val) {
      scheduleOpen()
    } else {
      clearTimers()
      active.value = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearTimers()
})
</script>
