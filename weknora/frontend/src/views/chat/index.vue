<script lang="ts">
import { defineComponent, onBeforeUnmount, ref, watch, type SetupContext } from 'vue'
import LegacyChatBusiness from '@/assets/business-baselines/ChatIndex.pre-view.vue'
import InputField from '../../components/Input-field.vue'
import botmsg from './components/botmsg.vue'
import usermsg from './components/usermsg.vue'
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue'
import ChatReferencesDrawer from '@/components/ChatReferencesDrawer.vue'
import ChatAttachmentPreviewDrawer from '@/components/ChatAttachmentPreviewDrawer.vue'
import FollowUpSuggestions from '@/components/chat/FollowUpSuggestions.vue'
import ChatQuestionMinimap from '@/components/chat/ChatQuestionMinimap.vue'
import MessageTimestamp from '@/components/chat/MessageTimestamp.vue'
import { shouldShowConversationTimestamp } from '@/utils/messageTimestamp'
import ChatHeader from '@/components/ChatHeader.vue'
import { useCurrentEntitlementStore } from '@/stores/entitlement'

const legacy = LegacyChatBusiness as any
const legacySetup = legacy.setup

export default defineComponent({
  ...legacy,
  name: 'ChatView',
  components: {
    ...(legacy.components || {}), InputField, botmsg, usermsg, KnowledgeBaseEditorModal,
    ChatReferencesDrawer, ChatAttachmentPreviewDrawer, FollowUpSuggestions, ChatHeader,
    ChatQuestionMinimap, MessageTimestamp,
  },
  setup(props: Record<string, unknown>, context: SetupContext) {
    const state = legacySetup?.(props, context)
    if (state && typeof state === 'object' && typeof state.then !== 'function') {
      const entitlementStore = useCurrentEntitlementStore()
      const replyState = (state as any).isReplying
      const stopEntitlementLifecycleWatch = watch(
        () => Boolean(replyState?.value),
        (replying, wasReplying) => {
          if (replying) {
            entitlementStore.invalidate()
            return
          }
          if (wasReplying) void entitlementStore.ensureFresh()
        },
        { flush: 'sync' },
      )
      const minimapTargetId = ref('')
      let minimapFlashTimer: ReturnType<typeof setTimeout> | null = null
      const clearMinimapFlash = () => {
        if (minimapFlashTimer !== null) {
          clearTimeout(minimapFlashTimer)
          minimapFlashTimer = null
        }
        minimapTargetId.value = ''
      }
      const jumpToQuestion = (id: string) => {
        const root = (state as any).scrollContainer?.value as HTMLElement | null
        if (!root || !id) return
        const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(id)
          : id.replace(/"/g, '\\"')
        const element = root.querySelector<HTMLElement>(`[data-message-id="${escapedId}"]`)
        if (!element) return
        const offset = element.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
        const nearEnd = root.scrollHeight - offset < root.clientHeight + 80
        const scrolledUp = (state as any).userHasScrolledUp
        if (scrolledUp && typeof scrolledUp === 'object' && 'value' in scrolledUp) scrolledUp.value = !nearEnd
        element.scrollIntoView({ block: 'start', behavior: 'smooth' })
        minimapTargetId.value = id
        if (minimapFlashTimer !== null) clearTimeout(minimapFlashTimer)
        minimapFlashTimer = setTimeout(clearMinimapFlash, 1200)
      }
      onBeforeUnmount(() => {
        clearMinimapFlash()
        stopEntitlementLifecycleWatch()
      })
      return {
        ...state,
        minimapTargetId,
        jumpToQuestion,
        shouldShowConversationTimestamp,
      }
    }
    return state
  },
})
</script>

<template>
  <main class="visual-chat-view" :class="{ 'is-embedded': embeddedMode, 'is-sidebar-collapsed': uiStore.sidebarCollapsed, 'has-references-panel': referencesDrawerVisible }">
    <ChatHeader v-if="!embeddedMode" :session="currentSession" :has-references-panel="referencesDrawerVisible" />

    <div ref="scrollContainer" class="visual-chat-scroll" @scroll="handleScroll">
      <div class="visual-chat-messages" :class="{ 'is-embedded': embeddedMode }">
        <div v-if="historyLoading && messagesList.length === 0" class="visual-chat-skeletons" aria-hidden="true">
          <div class="visual-chat-skeleton is-user"><t-skeleton animation="gradient" :row-col="[{ width: '45%', height: '36px', type: 'rect' }]" /></div>
          <div class="visual-chat-skeleton is-assistant"><t-skeleton animation="gradient" :row-col="[{ width: '80%', height: '16px' },{ width: '100%', height: '16px' },{ width: '60%', height: '16px' }]" /></div>
          <div class="visual-chat-skeleton is-user"><t-skeleton animation="gradient" :row-col="[{ width: '35%', height: '36px', type: 'rect' }]" /></div>
        </div>

        <div v-if="historyLoadingMore" class="visual-chat-history-feedback" role="status">
          <t-loading size="small" /><span>{{ t('common.loading') }}</span>
        </div>
        <div v-else-if="historyLoadError" class="visual-chat-history-feedback" role="alert">
          <span>{{ t('batchManage.loadFailed') }}</span>
          <t-button size="small" variant="outline" @click="retryHistoryLoad">{{ t('common.retry') }}</t-button>
        </div>

        <section v-if="!embeddedMode && messagesList.length === 0 && !loading && !historyLoading && !historyLoadError" class="visual-chat-suggestions" :class="{ 'has-questions': suggestedQuestions.length > 0 || suggestedQuestionsLoading }">
          <div v-if="suggestedQuestionsLoading && suggestedQuestions.length === 0" class="visual-chat-suggestions__inner">
            <div class="visual-chat-suggestions__caption"><t-skeleton animation="gradient" :row-col="[{ width: '120px', height: '14px' }]" /></div>
            <div class="visual-chat-suggestions__grid" aria-hidden="true"><div v-for="n in 6" :key="`sq-skel-${n}`" class="visual-chat-suggestion is-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '14px', type: 'rect' }]" /></div></div>
          </div>
          <Transition v-else appear name="visual-chat-suggestions-fade">
            <div v-if="suggestedQuestions.length > 0" class="visual-chat-suggestions__inner">
              <p class="visual-chat-suggestions__caption"><span>{{ t('chat.suggestedQuestions') }}</span><button type="button" class="visual-chat-suggestions__refresh" :disabled="suggestedQuestionsLoading" :title="t('chat.refreshSuggestedQuestions')" :aria-label="t('chat.refreshSuggestedQuestions')" @click="fetchSuggestedQuestions"><t-icon :name="suggestedQuestionsLoading ? 'loading' : 'refresh'" :class="{ 'is-spinning': suggestedQuestionsLoading }" /></button></p>
              <div class="visual-chat-suggestions__grid"><button v-for="item in suggestedQuestions" :key="item.question" type="button" class="visual-chat-suggestion" @click="handleSuggestedQuestionClick(item.question)"><span>{{ item.question }}</span><small v-if="item.source === 'faq'">FAQ</small></button></div>
            </div>
          </Transition>
        </section>

        <template v-for="(session, index) in messagesList" :key="session.id || `${session.role}-${session.created_at}-${index}`">
          <MessageTimestamp v-if="shouldShowConversationTimestamp(messagesList, index)" :value="session.created_at" />
          <article class="visual-chat-message-row" :class="[`is-${session.role}`, { 'is-minimap-target': session.role === 'user' && session.id && session.id === minimapTargetId }]" :data-message-id="session.role === 'user' ? (session.id || undefined) : undefined">
          <usermsg v-if="session.role === 'user'" :content="session.content" :mentioned_items="session.mentioned_items" :images="session.images" :attachments="session.attachments" :embedded-mode="embeddedMode" :session-id="session_id" />
          <template v-if="session.role === 'assistant' && shouldRenderAssistantMessage(session)">
            <botmsg :content="session.content" :session="session" :session-id="session_id" :user-query="getUserQuery(index)" :is-first-enter="isFirstEnter" :embedded-mode="embeddedMode" :follow-up-loading="Boolean(session.suggestionLoading && !session.suggestionSet?.questions?.length)" @scroll-bottom="scrollToBottom" @render-complete-change="(ready: boolean) => handleAnswerRenderComplete(session, ready)" />
            <FollowUpSuggestions v-if="session.answerFullyRendered && !session.suggestionsDismissed" :suggestion-set="session.suggestionSet" :loading="session.suggestionLoading" :allow-regenerate="session.suggestionSet?.allow_regenerate" @select="(item: any) => handleFollowUpSelect(session, item)" @regenerate="loadFollowUpSuggestions(session, true, true)" @impression="(set: any) => recordSuggestionEvent(session, set, 'impression')" @dismiss="(set: any) => dismissSuggestions(session, set)" />
          </template>
          </article>
        </template>

        <div v-if="showGlobalTypingIndicator" class="visual-chat-wait" role="status" :aria-label="t('chat.thinkingAlt')"><span aria-hidden="true" /></div>
      </div>
    </div>

    <ChatQuestionMinimap
      v-if="!embeddedMode"
      :scroll-container="scrollContainer"
      :messages="messagesList"
      @jump="jumpToQuestion"
    />

    <div class="visual-chat-input" :class="{ 'is-embedded': embeddedMode }">
      <InputField ref="inputFieldRef" :is-replying="isReplying" :session-id="session_id" :assistant-message-id="currentAssistantMessageId" :embedded-mode="embeddedMode" @send-msg="(query: any, modelId: any, mentionedItems: any, imageFiles: any, attachmentFiles: any, thinking: any, reasoningEffort: any) => sendMsg(query, modelId, mentionedItems, imageFiles, attachmentFiles, thinking, reasoningEffort)" @stop-generation="handleStopGeneration" />
    </div>

    <KnowledgeBaseEditorModal :visible="uiStore.showKBEditorModal" :mode="uiStore.kbEditorMode" :kb-id="uiStore.currentKBId || undefined" :initial-type="uiStore.kbEditorType" @update:visible="(val: boolean) => val ? null : uiStore.closeKBEditor()" @success="handleKBEditorSuccess" />
    <ChatReferencesDrawer />
    <ChatAttachmentPreviewDrawer />
  </main>
</template>

<style scoped lang="less">
.visual-chat-view { width: 100%; min-width: 0; min-height: 0; flex: 1 1 auto; position: relative; display: flex; flex-direction: column; overflow: hidden; background: #fff; color: #1f2937; transition: padding-right 220ms cubic-bezier(.22,.61,.36,1); }
.visual-chat-view.has-references-panel:not(.is-embedded) { @media (min-width: 960px) { padding-right: 420px; } }
.visual-chat-view.is-embedded { min-width: 100%; max-width: 100%; }
.visual-chat-scroll { min-height: 0; flex: 1 1 auto; width: 100%; overflow-y: auto; overflow-x: hidden; padding: 58px 16px 24px; box-sizing: border-box; }
@media (min-width: 768px) { .visual-chat-scroll { padding-left: 32px; padding-right: 32px; } }
.visual-chat-view.has-references-panel .visual-chat-scroll { @media (min-width: 960px) { padding-top: 18px; } }
.visual-chat-view.is-embedded .visual-chat-scroll { padding: 16px; }
.visual-chat-messages { width: min(768px,100%); min-width: 0; margin: 0 auto; padding-bottom: 16px; display: flex; flex-direction: column; gap: 32px; }
.visual-chat-messages.is-embedded { width: 100%; }
.visual-chat-history-feedback { display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--td-text-color-secondary); font-size: 13px; }
.visual-chat-message-row { min-width: 0; contain: layout style; display: flex; width: 100%; }
.visual-chat-message-row.is-user { justify-content: flex-end; }
.visual-chat-message-row.is-assistant { justify-content: flex-start; }
.visual-chat-message-row.is-minimap-target { animation: visual-chat-minimap-target-flash 1.2s ease; }
.visual-chat-skeletons { display: flex; flex-direction: column; gap: 32px; padding: 12px 0; }
.visual-chat-skeleton.is-user { display: flex; justify-content: flex-end; }
.visual-chat-skeleton.is-assistant { padding-right: 12%; }

.visual-chat-suggestions { min-height: 0; padding: 16px 0 8px; }
.visual-chat-suggestions__inner { display: flex; flex-direction: column; gap: 12px; }
.visual-chat-suggestions__caption { min-height: 20px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px; color: #9ca3af; font-size: 13px; line-height: 20px; }
.visual-chat-suggestions__refresh { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-chat-suggestions__refresh:hover:not(:disabled) { background: #f3f4f6; color: #4b5563; }
.visual-chat-suggestions__refresh :deep(.t-icon) { font-size: 12px; }
.visual-chat-suggestions__refresh .is-spinning { animation: visual-chat-spin .8s linear infinite; }
.visual-chat-suggestions__grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.visual-chat-suggestion { min-height: 36px; max-width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #374151; font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-chat-suggestion:hover:not(.is-skeleton) { border-color: #d1d5db; background: #f9fafb; color: #111827; }
.visual-chat-suggestion small { padding: 1px 5px; border-radius: 5px; background: #f3f4f6; color: #9ca3af; font-size: 9px; }
.visual-chat-suggestion.is-skeleton { width: 150px; pointer-events: none; }
.visual-chat-wait { min-height: 28px; display: flex; align-items: center; padding-left: 4px; }
.visual-chat-wait > span { width: 12px; height: 12px; box-sizing: border-box; border: 1.5px solid #d1d5db; border-top-color: #6b7280; border-radius: 50%; animation: visual-chat-spin .8s linear infinite; }
.visual-chat-input { flex: 0 0 auto; width: min(768px,calc(100% - 32px)); min-width: 0; margin: 0 auto; padding: 8px 0 18px; box-sizing: border-box; background: #fff; }
.visual-chat-input.is-embedded { width: 100%; padding: 10px 16px 16px; }
.visual-chat-suggestions-fade-enter-active,.visual-chat-suggestions-fade-leave-active { transition: opacity 140ms ease; }
.visual-chat-suggestions-fade-enter-from,.visual-chat-suggestions-fade-leave-to { opacity: 0; }
@keyframes visual-chat-spin { to { transform: rotate(360deg); } }
@keyframes visual-chat-minimap-target-flash { 0%, 100% { outline-color: transparent; } 20%, 60% { outline: 2px solid rgb(59 130 246 / 32%); outline-offset: 4px; } }
@media (prefers-reduced-motion: reduce) { .visual-chat-view,.visual-chat-suggestions-fade-enter-active,.visual-chat-suggestions-fade-leave-active { transition: none !important; } .visual-chat-wait > span,.visual-chat-suggestions__refresh .is-spinning { animation: none; } }
</style>
