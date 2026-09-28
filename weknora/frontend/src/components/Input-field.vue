<script lang="ts">
import { computed, defineComponent, nextTick, ref, watch, type SetupContext } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import LegacyInputFieldBusiness from '@/assets/business-baselines/Input-field.pre-view.vue'
import AttachmentUpload from './AttachmentUpload.vue'
import KnowledgeBaseSelector from './KnowledgeBaseSelector.vue'
import MentionSelector from './MentionSelector.vue'
import ModelSelector from './ModelSelector.vue'
import { useAuthStore } from '@/stores/auth'
import { useOrganizationStore } from '@/stores/organization'
import { BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID } from '@/api/agent'
import { useMarketplaceLibrary } from '@/composables/useMarketplaceLibrary'

const legacy = LegacyInputFieldBusiness as any
const legacySetup = legacy.setup

type CapsuleModel = {
  display_name?: string
  name?: string
}

type CapsuleSceneOption = {
  model_id?: string
  display_name?: string
}

const readStateValue = <T,>(value: T | { value: T }): T => {
  if (value && typeof value === 'object' && 'value' in value) return value.value
  return value as T
}

export default defineComponent({
  ...legacy,
  name: 'InputField',
  components: {
    ...(legacy.components || {}),
    AttachmentUpload,
    KnowledgeBaseSelector,
    MentionSelector,
    ModelSelector,
  },
  setup(props: Record<string, unknown>, context: SetupContext) {
    let legacyExposed: Record<string, unknown> = {}
    const legacyContext = {
      ...context,
      expose(exposed?: Record<string, unknown>) {
        legacyExposed = exposed || {}
      },
    } as SetupContext
    const state = legacySetup?.(props, legacyContext)
    const authStore = useAuthStore()
    const orgStore = useOrganizationStore()
    const route = useRoute()
    const router = useRouter()
    const { entries: subscribedAgents, load: loadSubscribedAgents } = useMarketplaceLibrary()
    const { t } = useI18n()
    if (state && typeof state === 'object' && typeof state.then !== 'function') {
      const legacyCreateSession = (state as any).createSession as ((value: string) => Promise<unknown>) | undefined
      const waitForModelLoad = async () => {
        if (!readStateValue<boolean>((state as any).modelsLoading)) return
        await new Promise<void>((resolve) => {
          const stop = watch(
            () => Boolean(readStateValue<boolean>((state as any).modelsLoading)),
            (loading) => {
              if (loading) return
              stop()
              resolve()
            },
            { flush: 'sync' },
          )
        })
      }
      const createSession = async (value: string) => {
        // The visual adapter owns only send-time coordination. Keep the frozen
        // business controller intact while ensuring a picker-triggered refresh
        // has settled and mandatory reasoning defaults are current.
        if (!value.trim() || props.embeddedMode || props.isReplying) {
          return legacyCreateSession?.(value)
        }
        await waitForModelLoad()
        await (state as any).loadChatModels?.()
        await waitForModelLoad()
        ;(state as any).ensureReasoningSelection?.()
        return legacyCreateSession?.(value)
      }
      const modelPickerView = ref<'overview' | 'models' | 'reasoning'>('overview')
      const selectedAgentPresentation = computed(() => {
        const selectedAgentRef = (state as any).selectedAgent
        const selectedAgent = selectedAgentRef && typeof selectedAgentRef === 'object' && 'value' in selectedAgentRef
          ? selectedAgentRef.value
          : selectedAgentRef
        const selectedAgentIdRef = (state as any).selectedAgentId
        const selectedAgentId = selectedAgentIdRef && typeof selectedAgentIdRef === 'object' && 'value' in selectedAgentIdRef
          ? selectedAgentIdRef.value
          : selectedAgentIdRef
        return { agent: selectedAgent, id: selectedAgent?.id || selectedAgentId }
      })
      const selectedAgentDisplayName = computed(() => {
        const { agent: selectedAgent, id: agentId } = selectedAgentPresentation.value
        if (agentId === BUILTIN_QUICK_ANSWER_ID) return t('input.normalMode')
        if (agentId === BUILTIN_SMART_REASONING_ID) return t('input.agentMode')
        return selectedAgent?.name || t('input.agentMode')
      })
      const selectedModelCapsuleName = computed(() => {
        const selectedModel = readStateValue<CapsuleModel | null>((state as any).selectedModel)
        const directName = selectedModel?.display_name?.trim() || selectedModel?.name?.trim()
        if (directName) return directName

        const selectedModelId = String(readStateValue<unknown>((state as any).selectedModelId) || '').trim()
        const effectiveScene = readStateValue<unknown>((state as any).effectiveConsumerScene)
        const sceneOptions = ((state as any).sceneOptionsFor?.(effectiveScene) || []) as CapsuleSceneOption[]
        const sceneName = sceneOptions.find((option) => option.model_id === selectedModelId)?.display_name?.trim()
        if (sceneName) return sceneName
        if (selectedModelId) return selectedModelId

        const legacyName = String(readStateValue<unknown>((state as any).selectedModelDisplayName) || '').trim()
        return legacyName && legacyName !== t('common.loading') ? legacyName : t('input.notConfigured')
      })
      // Keep the composer invitation concise and stable across model, source,
      // web-search, and Agent selections. Agent descriptions remain available
      // in Agent surfaces instead of becoming multi-line placeholder copy.
      const inputPlaceholder = computed(() => t('input.placeholder'))
      const visualModelDropdownStyle = computed(() => {
        const source = (state as any).modelDropdownStyle
        const style = source && typeof source === 'object' && 'value' in source ? source.value : source
        // Reading the legacy style keeps this computed value responsive to the
        // controller's scroll/resize updates. The reference card itself is
        // always right-aligned six pixels above the capsule.
        void style
        const button = (state as any).modelButtonRef?.value as HTMLElement | undefined
        if (button && typeof window !== 'undefined') {
          const rect = button.getBoundingClientRect()
          const menuWidth = Math.min(224, Math.max(0, window.innerWidth - 32))
          const rightInset = Math.min(
            Math.max(16, window.innerWidth - rect.right),
            Math.max(16, window.innerWidth - menuWidth - 16),
          )
          const bottomInset = window.innerHeight - rect.top + 6
          return {
            position: 'fixed',
            top: 'auto',
            left: 'auto',
            right: `${rightInset}px`,
            bottom: `${bottomInset}px`,
            width: 'min(224px, calc(100vw - 32px))',
            '--visual-mobile-menu-max-height': `${Math.max(0, rect.top - 18)}px`,
          }
        }
        return {
          position: 'fixed',
          top: 'auto',
          left: 'auto',
          right: '16px',
          bottom: '16px',
          width: 'min(224px, calc(100vw - 32px))',
        }
      })
      const handleNativeInput = (event: Event) => {
        const target = event.target as HTMLTextAreaElement | null
        if (target && (state as any).query && typeof (state as any).query === 'object' && 'value' in (state as any).query) {
          ;(state as any).query.value = target.value
        }
        ;(state as any).onInput?.(event)
      }
      const handleNativeKeydown = (event: KeyboardEvent) => {
        const queryRef = (state as any).query
        const value = queryRef && typeof queryRef === 'object' && 'value' in queryRef ? queryRef.value : ''
        const showMention = Boolean(readStateValue<boolean>((state as any).showMention))
        if (event.keyCode === 13 && !event.shiftKey && !event.ctrlKey && !showMention) {
          event.preventDefault()
          void createSession(value)
          return
        }
        ;(state as any).onKeydown?.(value, { e: event })
      }
      const triggerSend = (text: string) => {
        if (!text.trim()) return
        const queryRef = (state as any).query
        if (queryRef && typeof queryRef === 'object' && 'value' in queryRef) queryRef.value = text
        void nextTick(() => createSession(text))
      }
      const openModelPicker = () => {
        modelPickerView.value = 'overview'
        void loadSubscribedAgents()
        ;(state as any).toggleModelSelector?.()
      }
      const restoreModelPickerFocus = () => {
        void nextTick(() => (state as any).modelButtonRef?.value?.focus?.())
      }
      const closeModelPicker = () => {
        ;(state as any).closeModelSelector?.()
        restoreModelPickerFocus()
      }
      const selectModelFromPicker = (value: string) => {
        ;(state as any).handleModelChange?.(value)
        restoreModelPickerFocus()
      }
      const selectReasoningFromPicker = (value: string) => {
        ;(state as any).selectReasoningEffort?.(value)
        ;(state as any).closeModelSelector?.()
        restoreModelPickerFocus()
      }
      const preserveDraftForNewChat = () => {
        const draft = readStateValue<string>((state as any).query)
        if (draft) (state as any).menuStore.newChatDraft = draft
      }
      const selectMarketplaceAgentFromPicker = async (productId: string) => {
        if (!subscribedAgents.value.some(entry => entry.product_id === productId && entry.can_chat)) return
        closeModelPicker()
        if ((state as any).settingsStore.settings.marketplaceProductId === productId && !route.query.marketplace_product) return
        if (route.name !== 'globalCreatChat') preserveDraftForNewChat()
        // The existing entry rechecks current purchase access before selecting
        // any resources. Historical conversations retain their original scope.
        await router.push({ path: '/platform/creatChat', query: { marketplace_product: productId } })
      }
      const selectAgentFromPicker = async (agent: any, sourceTenantId?: string) => {
        const settings = (state as any).settingsStore
        if (!settings.settings.marketplaceProductId && agent.id === settings.selectedAgentId
          && (sourceTenantId || '') === (settings.selectedAgentSourceTenantId || '') && !route.query.marketplace_product) {
          closeModelPicker()
          return
        }
        if (route.name !== 'globalCreatChat' && settings.settings.marketplaceProductId) {
          preserveDraftForNewChat()
          await router.push({ path: '/platform/creatChat' })
          if (route.name !== 'globalCreatChat') return
        } else if (route.query.marketplace_product) {
          const query = { ...route.query }; delete query.marketplace_product
          await router.replace({ path: route.path, query })
        }
        await (state as any).handleSelectAgent?.(agent, sourceTenantId)
        closeModelPicker()
      }
      context.expose({
        ...legacyExposed,
        triggerSend,
      })
      return {
        ...state,
        authStore,
        orgStore,
        subscribedAgents,
        createSession,
        modelPickerView,
        selectedAgentDisplayName,
        selectedModelCapsuleName,
        inputPlaceholder,
        visualModelDropdownStyle,
        selectAgentFromPicker,
        selectMarketplaceAgentFromPicker,
        openModelPicker,
        closeModelPicker,
        selectModelFromPicker,
        selectReasoningFromPicker,
        handleNativeInput,
        handleNativeKeydown,
      }
    }
    context.expose(legacyExposed)
    return state
  },
})
</script>

<template>
  <div class="visual-chat-composer" :class="{ 'is-embedded': embeddedMode }" @drop="onDrop" @dragover="onDragOver">
    <input ref="imageInputRef" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple class="visual-chat-composer__native-file" @change="handleImageSelect" />

    <div class="visual-chat-composer__surface" data-guide="chat-input" @click.stop>
      <div v-if="uploadedImages.length > 0" class="visual-chat-composer__images">
        <div v-for="(img, idx) in uploadedImages" :key="idx" class="visual-chat-composer__image">
          <img :src="img.preview" alt="" />
          <button type="button" :aria-label="$t('common.remove')" @click.stop="removeImage(idx)"><t-icon name="close" /></button>
        </div>
      </div>

      <AttachmentUpload
        ref="attachmentUploadRef"
        :max-files="5"
        :session-id="sessionId"
        :agent-id="selectedAgentId"
        :agent-source-tenant-id="settingsStore.selectedAgentSourceTenantId ?? undefined"
        @update:files="uploadedAttachments = $event"
      />

      <div v-if="allSelectedItems.length > 0" class="visual-chat-composer__resources">
        <span v-for="item in allSelectedItems" :key="`${item.type}:${item.id}`" class="visual-chat-resource" :class="{ 'is-agent-configured': item.isAgentConfigured }" :data-resource-type="item.type">
          <span class="visual-chat-resource__icon-wrap" :class="{ 'has-org': item.org_name }">
            <span class="visual-chat-resource__icon">
              <t-icon v-if="item.type === 'kb'" :name="item.kbType === 'faq' ? 'chat-bubble-help' : 'folder'" />
              <t-icon v-else :name="getMentionIcon(item)" />
            </span>
            <span v-if="item.org_name" class="visual-chat-resource__org" aria-hidden="true"><img :src="getOrganizationBadgeSrc(item.type)" alt="" /></span>
          </span>
          <span class="visual-chat-resource__name" :title="item.name">{{ item.name }}</span>
          <button v-if="!settingsStore.settings.marketplaceProductId" type="button" class="visual-chat-resource__remove" :aria-label="$t('common.remove')" @click.stop="removeSelectedItem(item)"><t-icon name="close" /></button>
        </span>
      </div>

      <textarea
        ref="textareaRef"
        v-model="query"
        class="visual-chat-composer__textarea"
        :placeholder="inputPlaceholder"
        name="description"
        rows="1"
        @keydown="handleNativeKeydown"
        @input="handleNativeInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @paste="onPaste"
      />

      <div class="visual-chat-composer__toolbar" :class="{ 'is-embedded': embeddedMode }">
        <div v-if="!embeddedMode" class="visual-chat-composer__tools">
          <t-tooltip v-if="showImageUploadButton" placement="top" theme="light">
            <template #content>{{ $t('chat.imageUploadTooltip') }}</template>
            <button type="button" class="visual-chat-composer__tool" :class="{ 'is-active': uploadedImages.length > 0 }" @click.stop="triggerImageUpload">
              <t-icon name="image" />
              <span v-if="uploadedImages.length > 0" class="visual-chat-composer__count">{{ uploadedImages.length }}</span>
            </button>
          </t-tooltip>

          <t-tooltip placement="top" theme="light">
            <template #content>{{ uploadedAttachments.length > 0 ? $t('chat.attachmentWithCount', { count: uploadedAttachments.length }) : $t('chat.attachmentUploadTooltip') }}</template>
            <button type="button" class="visual-chat-composer__tool" :class="{ 'is-active': uploadedAttachments.length > 0 }" @click.stop="attachmentUploadRef?.triggerFileSelect()">
              <t-icon name="attach" />
              <span v-if="uploadedAttachments.length > 0" class="visual-chat-composer__count">{{ uploadedAttachments.length }}</span>
            </button>
          </t-tooltip>

          <t-tooltip placement="top" theme="light">
            <template #content>
              <span v-if="settingsStore.settings.marketplaceProductId">{{ $t('creatorMarketplace.boundResources') }}</span>
              <span v-else-if="isMentionDisabled && isKnowledgeBaseDisabledByAgent" class="visual-chat-composer__disabled-hint">
                <span>{{ $t('input.kbDisabledByAgent') }}</span>
                <button v-if="!authStore.isLiteMode" type="button" @click.stop.prevent="handleGoToAgentSettings('knowledge')">{{ $t('input.goToAgentSettings') }}</button>
              </span>
              <span v-else>{{ allSelectedItems.length > 0 ? $t('input.knowledgeBaseWithCount', { count: allSelectedItems.length }) : $t('input.knowledgeBase') }}</span>
            </template>
            <button ref="atButtonRef" type="button" class="visual-chat-composer__tool is-at" :class="{ 'is-active': allSelectedItems.length > 0, 'is-disabled': isMentionDisabled }" data-guide="chat-kb-mention" :aria-disabled="isMentionDisabled" @mousedown.prevent="triggerMention">
              <span class="visual-chat-composer__at">@</span>
              <span v-if="allSelectedItems.length > 0" class="visual-chat-composer__count">{{ allSelectedItems.length }}</span>
            </button>
          </t-tooltip>

          <t-tooltip v-if="!authStore.isLiteMode && showWebSearchButton" placement="top" theme="light">
            <template #content>{{ isWebSearchEnabled ? $t('input.messages.webSearchEnabled') : $t('input.messages.webSearchDisabled') }}</template>
            <button type="button" class="visual-chat-composer__tool" :class="{ 'is-active': isWebSearchEnabled }" @click.stop="toggleWebSearch">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 12h17M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21M12 3C9.7 5.5 8.5 8.5 8.5 12s1.2 6.5 3.5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </t-tooltip>

        </div>

        <div class="visual-chat-composer__actions">
          <button
            v-if="!embeddedMode"
            ref="modelButtonRef"
            type="button"
            class="visual-chat-composer__combined-picker"
            data-guide="chat-picker"
            :class="{ 'is-open': showModelSelector }"
            :aria-expanded="showModelSelector"
            :aria-label="`${selectedAgentDisplayName} ${selectedModelCapsuleName} ${selectedReasoningLabel}`"
            @click.stop="openModelPicker"
          >
            <span class="visual-chat-composer__combined-picker-copy">
              <span class="visual-chat-composer__combined-picker-agent" :title="selectedAgentDisplayName">{{ selectedAgentDisplayName }}</span>
              <span class="visual-chat-composer__combined-picker-dot" aria-hidden="true">·</span>
              <span
                class="visual-chat-composer__combined-picker-model"
                :title="selectedModelCapsuleName"
              >{{ selectedModelCapsuleName }}</span>
              <span v-if="reasoningEffort !== 'none' && selectedReasoningLabel" class="visual-chat-composer__combined-picker-effort">{{ selectedReasoningLabel }}</span>
            </span>
            <t-icon name="chevron-down" />
          </button>

          <div class="visual-chat-composer__submit">
          <t-tooltip v-if="isReplying" :content="$t('input.stopGeneration')" placement="top">
            <button type="button" class="visual-chat-composer__send is-stop" @click="handleStop"><span class="visual-chat-composer__stop-square" /></button>
          </t-tooltip>
          <button v-else type="button" class="visual-chat-composer__send" :class="{ 'is-disabled': !query.length }" :disabled="!query.length" data-guide="chat-send" :aria-label="$t('input.send')" @click="createSession(query)"><t-icon name="send" /></button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div class="visual-chat-composer__overlay" :class="{ 'is-visible': showModelSelector }" @click="closeModelPicker">
        <Transition name="visual-chat-composer__model-menu-motion">
        <div v-if="showModelSelector" class="visual-chat-composer__model-menu" :style="visualModelDropdownStyle" @click.stop>
          <!-- ModelSelector owns the keyboard listbox (the old native shape was
               v-for="model in availableModels"); the frozen controller still
               provides availableModels, modelPickerView === 'overview',
               modelPickerView === 'models', modelPickerView = 'reasoning',
               and modelPickerView = 'models' as its unchanged business contract. -->
              <ModelSelector
                class="visual-chat-composer__native-model-selector"
                mode="chat"
                :models="availableModels"
                :scene-options="sceneOptionsFor(effectiveConsumerScene)"
                :selected-model-id="selectedModelId"
                :selected-model-display-name="selectedModelDisplayName"
                :selected-reasoning-label="selectedReasoningLabel"
                :reasoning-options="reasoningOptions"
                :reasoning-effort="reasoningEffort"
                :agents="enabledAgents"
                :shared-agents="orgStore.sharedAgents"
                :subscribed-agents="subscribedAgents"
                :selected-marketplace-product-id="settingsStore.settings.marketplaceProductId"
                :selected-agent-id="selectedAgentId"
                :selected-agent-source-tenant-id="settingsStore.selectedAgentSourceTenantId || undefined"
                :selected-agent-display-name="selectedAgentDisplayName"
                :view="modelPickerView"
                @select-agent="selectAgentFromPicker"
                @select-marketplace-agent="selectMarketplaceAgentFromPicker"
                @select-model="selectModelFromPicker"
                @select-reasoning="selectReasoningFromPicker"
                @update:view="modelPickerView = $event"
                @close="closeModelPicker"
              />
        </div>
        </Transition>
      </div>
    </Teleport>

    <Teleport to="body">
      <MentionSelector ref="mentionSelectorRef" :visible="showMention" :style="mentionStyle" :items="mentionItems" :has-more="mentionHasMore" :loading="mentionLoading" :empty-hint="mentionEmptyHint" :query="mentionQuery" :group-counts="mentionGroupCounts" v-model:active-index="mentionActiveIndex" @select="onMentionSelect" @load-more="loadMoreMentionItems" />
    </Teleport>
    <KnowledgeBaseSelector v-model:visible="showKbSelector" :anchor-el="atButtonRef" @close="showKbSelector = false" />
  </div>
</template>

<style scoped lang="less">
.visual-chat-composer { width: 100%; min-width: 0; position: relative; color: #374151; }
.visual-chat-composer__native-file { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.visual-chat-composer__surface {
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 16px;
  box-sizing: border-box;
  overflow: visible;
  border: 1px solid rgb(229 231 235 / 60%);
  border-radius: 20px;
  background: #f4f5f7;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  transition: all 150ms ease;
}
.visual-chat-composer__surface:hover,.visual-chat-composer__surface:focus-within { border-color: #d1d5db; }
.visual-chat-composer__surface:focus-within { background: #fff; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 10%),0 2px 4px -2px rgb(0 0 0 / 10%); }

.visual-chat-composer__images { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgb(229 231 235 / 60%); display: flex; flex-wrap: wrap; gap: 8px; }
.visual-chat-composer__image { position: relative; width: 44px; height: 44px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-chat-composer__image img { width: 100%; height: 100%; display: block; object-fit: cover; }
.visual-chat-composer__image button { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; padding: 2px; border: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgb(17 24 39 / 72%); color: #fff; cursor: pointer; }
.visual-chat-composer__resources { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgb(229 231 235 / 60%); display: flex; flex-wrap: wrap; gap: 8px; }
.visual-chat-resource { max-width: 260px; min-height: 30px; padding: 4px 6px 4px 8px; box-sizing: border-box; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px; background: #fff; color: #374151; font-size: 12px; line-height: 18px; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-chat-resource.is-agent-configured { border-style: dashed; }
.visual-chat-resource__icon-wrap { position: relative; flex: 0 0 14px; width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; }
.visual-chat-resource__icon { display: inline-flex; color: #6b7280; }
.visual-chat-resource__icon :deep(.t-icon) { font-size: 14px; }
.visual-chat-resource__org { position: absolute; right: -3px; bottom: -2px; width: 8px; height: 8px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #fff; box-shadow: 0 0 0 1px #e5e7eb; }
.visual-chat-resource__org img { width: 5px; height: 5px; object-fit: contain; }
.visual-chat-resource__name { min-width: 0; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.visual-chat-resource__remove { flex: 0 0 18px; width: 18px; height: 18px; padding: 2px; border: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-chat-resource__remove:hover { color: #374151; }

.visual-chat-composer__textarea { width: 100%; min-height: 44px !important; max-height: 180px !important; padding: 0 !important; box-sizing: border-box; overflow-y: auto; border: 0 !important; outline: 0; resize: none; field-sizing: content; background: transparent !important; color: #1f2937; font-family: var(--app-font-family); font-size: 15px; line-height: 1.625; font-weight: 400; }
.visual-chat-composer__textarea::placeholder { color: #9ca3af; }

.visual-chat-composer__toolbar { margin-top: 8px; padding-top: 4px; display: flex; align-items: center; justify-content: space-between; gap: 12px; user-select: none; }
.visual-chat-composer__toolbar.is-embedded { justify-content: flex-end; }
.visual-chat-composer__tools { min-width: 0; flex: 1 1 auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.visual-chat-composer__tool { position: relative; flex: 0 0 22px; width: 22px; height: 22px; padding: 2px; border: 0; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #6b7280; font: inherit; cursor: pointer; transition: color 150ms ease; }
.visual-chat-composer__tool:hover,.visual-chat-composer__tool.is-active { color: #1f2937; }
.visual-chat-composer__tool.is-disabled { opacity: .45; }
.visual-chat-composer__tool :deep(.t-icon),.visual-chat-composer__tool svg { width: 18px; height: 18px; font-size: 18px; }
.visual-chat-composer__at { font-size: 18px; line-height: 18px; font-weight: 500; }
.visual-chat-composer__count { position: absolute; top: -5px; right: -6px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #111827; color: #fff; font-size: 8px; line-height: 1; }
.visual-chat-composer__disabled-hint { display: flex; align-items: center; gap: 6px; }
.visual-chat-composer__disabled-hint button { padding: 0; border: 0; background: transparent; color: #2563eb; font: inherit; text-decoration: underline; cursor: pointer; }
.visual-chat-composer__actions { flex: 0 0 auto; min-width: 0; display: flex; align-items: center; gap: 8px; }
.visual-chat-composer__combined-picker { min-width: 0; max-width: min(360px, 48vw); width: fit-content; padding: 6px 12px; border: 1px solid transparent; border-radius: 999px; outline: none; overflow: hidden; display: inline-flex; align-items: center; gap: 6px; background: #eaebef; color: #1f2937; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
.visual-chat-composer__combined-picker:not(.is-open):hover { background: #dfe1e7; }
.visual-chat-composer__combined-picker:not(.is-open):active { background: #d6d8df; }
.visual-chat-composer__combined-picker.is-open { background: #e5e7eb; color: #111827; box-shadow: 0 0 0 1px rgb(209 213 219 / 80%), 0 1px 2px rgb(0 0 0 / 5%); }
.visual-chat-composer__combined-picker-copy { min-width: 0; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.visual-chat-composer__combined-picker-agent { min-width: 0; max-width: 120px; overflow: hidden; color: #111827; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.visual-chat-composer__combined-picker-dot { color: #9ca3af; }
.visual-chat-composer__combined-picker-model,.visual-chat-composer__combined-picker-effort { flex: 0 1 auto; min-width: 0; overflow: hidden; color: #4b5563; text-overflow: ellipsis; white-space: nowrap; }
.visual-chat-composer__combined-picker-effort { flex: 0 0 auto; color: #6b7280; }
.visual-chat-composer__combined-picker > :deep(.t-icon:last-child) { flex: 0 0 14px; color: #6b7280; font-size: 14px; transition: transform 150ms ease, color 150ms ease; }
.visual-chat-composer__combined-picker.is-open > :deep(.t-icon:last-child) { transform: rotate(180deg); color: #111827; }
.visual-chat-composer__submit { flex: 0 0 auto; display: flex; align-items: center; }
.visual-chat-composer__send { width: 32px; height: 32px; padding: 8px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: #111827; color: #fff; cursor: pointer; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); transition: all 150ms ease; }
.visual-chat-composer__send:hover:not(:disabled) { background: #000; }
.visual-chat-composer__send:active:not(:disabled) { transform: scale(.95); }
.visual-chat-composer__send.is-disabled,.visual-chat-composer__send:disabled { background: #e2e4e8; color: #9ca3af; cursor: not-allowed; box-shadow: none; }
.visual-chat-composer__send.is-stop { background: #111827; color: #fff; }
.visual-chat-composer__send :deep(.t-icon) { font-size: 14px; }
.visual-chat-composer__stop-square { width: 10px; height: 10px; border-radius: 2px; background: currentColor; }

.visual-chat-composer__overlay { position: fixed; inset: 0; z-index: 9998; background: transparent; pointer-events: none; }
.visual-chat-composer__overlay.is-visible { pointer-events: auto; }
.visual-chat-composer__model-menu { position: fixed; z-index: 9999; box-sizing: border-box; overflow: visible; width: min(224px, calc(100vw - 32px)); min-width: min(224px, calc(100vw - 32px)); display: flex; flex-direction: column; transform-origin: bottom right; }
.visual-chat-composer__model-menu :deep(.visual-model-selector--chat) { min-height: 0; width: 100%; flex: 1 1 auto; overflow: visible; }
.visual-chat-composer__model-menu-motion-enter-active,
.visual-chat-composer__model-menu-motion-leave-active { transition: opacity 180ms cubic-bezier(.16,1,.3,1), transform 180ms cubic-bezier(.16,1,.3,1); }
.visual-chat-composer__model-menu-motion-enter-from { opacity: 0; transform: translate(8px, 3px) scale(.96); }
.visual-chat-composer__model-menu-motion-leave-to { opacity: 0; transform: translate(6px, 2px) scale(.97); }

@media (max-width: 768px) { .visual-chat-composer__surface { border-radius: 16px; } .visual-chat-composer__tools { gap: 12px; } }
@media (min-width: 640px) { .visual-chat-composer__tools { gap: 16px; } }
@media (max-width: 620px) { .visual-chat-composer__toolbar { align-items: flex-end; } .visual-chat-composer__combined-picker { max-width: min(280px, 60vw); } }
@media (max-width: 430px) { .visual-chat-composer__toolbar { align-items: flex-start; flex-wrap: wrap; } .visual-chat-composer__tools { flex: 1 1 100%; } .visual-chat-composer__actions { margin-left: auto; } .visual-chat-composer__combined-picker { max-width: calc(100vw - 102px); } .visual-chat-composer__combined-picker-agent { max-width: 72px; } }

:root[theme-mode="dark"] .visual-chat-composer__combined-picker { background: #27272a; color: #e4e4e7; }
:root[theme-mode="dark"] .visual-chat-composer__combined-picker:hover { background: #323238; }
:root[theme-mode="dark"] .visual-chat-composer__combined-picker.is-open { background: #3f3f46; color: #fff; box-shadow: 0 0 0 1px #52525b; }
:root[theme-mode="dark"] .visual-chat-composer__combined-picker-agent { color: #f4f4f5; }
:root[theme-mode="dark"] .visual-chat-composer__combined-picker-model,
:root[theme-mode="dark"] .visual-chat-composer__combined-picker-effort { color: #d4d4d8; }
@media (prefers-reduced-motion: reduce) { .visual-chat-composer__surface,.visual-chat-composer__send,.visual-chat-composer__combined-picker,.visual-chat-composer__model-menu { transition: none !important; } }
</style>
