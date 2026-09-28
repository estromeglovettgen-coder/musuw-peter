import type { SpotlightGuideStep } from '@/types/spotlightGuide'
import { safeGetItem, safeSetItem, userKey } from '@/composables/preferenceStorage'

export const GLOBAL_USER_GUIDE_KEY = 'musuw:new-user-guide-done:v2'
export const OPEN_NEW_USER_GUIDE_EVENT = 'weknora:open-new-user-guide'

export function openNewUserGuide() {
  window.dispatchEvent(new CustomEvent(OPEN_NEW_USER_GUIDE_EVENT))
}

export const KB_EDITOR_FOCUS_SECTION_EVENT = 'weknora:kb-editor-focus-section'
export const AGENT_EDITOR_FOCUS_SECTION_EVENT = 'weknora:agent-editor-focus-section'

export type ContextualGuideTourId =
  | 'kbList'
  | 'kbCreate'
  | 'kbDetail'
  | 'chat'
  | 'tenantModels'
  | 'agentList'
  | 'agentCreate'

const focusKbEditorSection = (section: string) => {
  window.dispatchEvent(
    new CustomEvent(KB_EDITOR_FOCUS_SECTION_EVENT, { detail: { section } }),
  )
}

const focusKbEditorBasic = () => focusKbEditorSection('basic')

export interface ContextualGuideTourConfig {
  storageKey: string
  stepI18nPrefix: string
  steps: SpotlightGuideStep[]
  /** 首次展示前的延迟（毫秒） */
  openDelayMs: number
  /** 完成本引导时一并标记为已完成的其他引导 */
  alsoCompleteTours?: ContextualGuideTourId[]
}

export const CONTEXTUAL_GUIDE_TOURS: Record<ContextualGuideTourId, ContextualGuideTourConfig> = {
  kbList: {
    storageKey: 'weknora:contextual-guide-kb-list:v2',
    stepI18nPrefix: 'contextualGuide.kbList.steps',
    openDelayMs: 500,
    steps: [
      {
        key: 'create',
        // Empty states expose the same guide marker as the header action. Keep
        // the empty CTA first so the guide lands on the action users can see in
        // the middle of an empty list, while retaining a deterministic header
        // fallback for populated lists.
        target: '.visual-kb-empty .empty-state-btn[data-guide="kb-list-create"], .visual-kb-list__header [data-guide="kb-list-create"]',
        placement: 'bottom',
        interact: true,
      },
    ],
  },
  // 步骤由 KbCreateContextualGuide.vue 按文档库/FAQ 动态组装
  kbCreate: {
    storageKey: 'weknora:contextual-guide-kb-create:v3',
    stepI18nPrefix: 'contextualGuide.kbCreate.steps',
    openDelayMs: 450,
    alsoCompleteTours: ['kbList'],
    steps: [],
  },
  tenantModels: {
    storageKey: 'weknora:contextual-guide-tenant-models:v1',
    stepI18nPrefix: 'contextualGuide.tenantModels.steps',
    openDelayMs: 500,
    steps: [],
  },
  kbDetail: {
    storageKey: 'weknora:contextual-guide-kb-detail:v1',
    stepI18nPrefix: 'contextualGuide.kbDetail.steps',
    openDelayMs: 600,
    steps: [
      {
        key: 'rag',
      },
      {
        key: 'wiki',
      },
      {
        key: 'uploadFile',
        target: '[data-guide="kb-detail-add-doc"]',
        placement: 'bottom',
      },
      {
        key: 'uploadUrl',
        target: '[data-guide="kb-detail-import-url"]',
        placement: 'bottom',
        optional: true,
      },
    ],
  },
  chat: {
    storageKey: 'weknora:contextual-guide-chat:v1',
    stepI18nPrefix: 'contextualGuide.chat.steps',
    openDelayMs: 800,
    steps: [
      {
        key: 'picker',
        target: '[data-guide="chat-picker"]',
        placement: 'top',
      },
      {
        key: 'kb',
        target: '[data-guide="chat-kb-mention"]',
        placement: 'top',
        optional: true,
      },
      {
        key: 'input',
        target: '[data-guide="chat-input"]',
        placement: 'top',
      },
      {
        key: 'send',
        target: '[data-guide="chat-send"]',
        placement: 'top',
      },
      { key: 'done' },
    ],
  },
  agentList: {
    storageKey: 'weknora:contextual-guide-agent-list:v1',
    stepI18nPrefix: 'contextualGuide.agentList.steps',
    openDelayMs: 500,
    steps: [
      {
        key: 'create',
        target: '.empty-state-btn[data-guide="agent-list-create"], [data-guide="agent-list-create"]',
        placement: 'bottom',
        interact: true,
      },
    ],
  },
  agentCreate: {
    storageKey: 'weknora:contextual-guide-agent-create:v1',
    stepI18nPrefix: 'contextualGuide.agentCreate.steps',
    openDelayMs: 450,
    alsoCompleteTours: ['agentList'],
    steps: [],
  },
}

export function isContextualGuideDone(tourId: ContextualGuideTourId): boolean {
  return safeGetItem(userKey(CONTEXTUAL_GUIDE_TOURS[tourId].storageKey)) === '1'
}

export function markContextualGuideDone(tourId: ContextualGuideTourId) {
  const config = CONTEXTUAL_GUIDE_TOURS[tourId]
  safeSetItem(userKey(config.storageKey), '1')
  config.alsoCompleteTours?.forEach((id) => {
    safeSetItem(userKey(CONTEXTUAL_GUIDE_TOURS[id].storageKey), '1')
  })
}

export function isGlobalUserGuideDone(): boolean {
  return safeGetItem(userKey(GLOBAL_USER_GUIDE_KEY)) === '1'
}

export function markGlobalUserGuideDone() {
  safeSetItem(userKey(GLOBAL_USER_GUIDE_KEY), '1')
}
