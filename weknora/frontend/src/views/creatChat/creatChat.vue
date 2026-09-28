<template>
    <main class="visual-new-chat-view">
        <section class="visual-new-chat-stack" aria-labelledby="visual-new-chat-title">
            <h1 id="visual-new-chat-title" class="visual-new-chat-title" style="--wails-draggable: drag">
                {{ $t('createChat.title') }}
            </h1>

            <div ref="sqContainerRef" class="visual-new-chat-suggestions">
                <div v-if="sqLoading && suggestedQuestions.length === 0" class="visual-new-chat-suggestions__inner">
                    <div class="visual-new-chat-suggestions__heading">
                        <t-skeleton animation="gradient" :row-col="[{ width: '112px', height: '13px' }]" />
                    </div>
                    <div class="visual-new-chat-suggestions__list" aria-hidden="true">
                        <div v-for="n in 6" :key="'sq-skel-' + n" class="visual-new-chat-suggestion visual-new-chat-suggestion--skeleton">
                            <t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '13px', type: 'rect' }]" />
                        </div>
                    </div>
                </div>

                <transition
                    v-else
                    appear
                    name="visual-new-chat-suggestions"
                    mode="out-in"
                    @before-leave="onBeforeLeave"
                    @after-leave="onAfterLeave"
                    @enter="onEnter"
                    @after-enter="onQuestionsEntered"
                >
                    <div v-if="suggestedQuestions.length > 0" :key="sqRenderKey" class="visual-new-chat-suggestions__inner">
                        <div class="visual-new-chat-suggestions__heading">
                            <span>{{ $t('chat.suggestedQuestions') }}</span>
                            <button
                                type="button"
                                class="visual-new-chat-suggestions__refresh"
                                :disabled="sqLoading"
                                :title="$t('chat.refreshSuggestedQuestions')"
                                :aria-label="$t('chat.refreshSuggestedQuestions')"
                                @click="fetchSuggestedQuestions"
                            >
                                <t-icon :name="sqLoading ? 'loading' : 'refresh'" :class="{ 'is-spinning': sqLoading }" />
                            </button>
                        </div>

                        <div class="visual-new-chat-suggestions__list">
                            <button
                                v-for="(item, index) in suggestedQuestions"
                                :key="item.question"
                                type="button"
                                class="visual-new-chat-suggestion"
                                :class="{ 'is-visible': sqCardsRevealed }"
                                :style="{ transitionDelay: sqCardsRevealed ? `${index * 50}ms` : '0ms' }"
                                @click="handleSuggestedQuestionClick(item.question)"
                            >
                                <span class="visual-new-chat-suggestion__text">{{ item.question }}</span>
                                <span v-if="item.source === 'faq'" class="visual-new-chat-suggestion__badge">FAQ</span>
                            </button>
                        </div>
                    </div>
                </transition>
            </div>

            <div v-if="marketplaceOpening || (settingsStore.settings.marketplaceProductId && marketplaceChat.loading)" class="market-service-selection" role="status">{{ t('creatorMarketplace.openingChat') }}</div>
            <div v-else-if="settingsStore.settings.marketplaceProductId && (marketplaceChat.failed || marketplaceChat.product?.access?.can_chat === false)" class="market-service-selection" role="alert">
              <div><strong>{{ t('creatorMarketplace.selectedService', { title: marketplaceChat.product?.title || t('creatorMarketplace.title') }) }}</strong><p>{{ t(marketplaceChat.failed ? 'creatorMarketplace.loadFailed' : 'creatorMarketplace.noAccess') }}</p></div>
              <t-button theme="default" variant="text" size="small" @click="settingsStore.selectAgent(BUILTIN_SMART_REASONING_ID)">{{ t('creatorMarketplace.clearService') }}</t-button>
            </div>
            <div class="visual-new-chat-composer">
                <InputField ref="inputFieldRef" @send-msg="sendMsg" />
            </div>
            <MarketplaceHomeEntry v-if="!settingsStore.settings.marketplaceProductId" />
        </section>
    </main>

    <KnowledgeBaseEditorModal
      :visible="uiStore.showKBEditorModal"
      :mode="uiStore.kbEditorMode"
      :kb-id="uiStore.currentKBId || undefined"
      :initial-type="uiStore.kbEditorType"
      @update:visible="(val) => val ? null : uiStore.closeKBEditor()"
      @success="handleKBEditorSuccess"
    />

    <ContextualGuide
      tour="chat"
      :when="authStore.isLiteMode && route.name === 'globalCreatChat'"
    />
</template>
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import InputField from '@/components/Input-field.vue';
import ContextualGuide from '@/components/ContextualGuide.vue';
import { createSessions } from "@/api/chat/index";
import { BUILTIN_SMART_REASONING_ID, getSuggestedQuestions } from "@/api/agent/index";
import type { SuggestedQuestion } from "@/api/agent/index";
import { useMenuStore } from '@/stores/menu';
import { useSettingsStore } from '@/stores/settings';
import { useUIStore } from '@/stores/ui';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue';
import { useKnowledgeBaseCreationNavigation } from '@/hooks/useKnowledgeBaseCreationNavigation';
import { useAuthStore } from '@/stores/auth';
import { useMarketplaceChatStore } from '@/stores/marketplaceChat';
import MarketplaceHomeEntry from '@/views/marketplace/MarketplaceHomeEntry.vue';

const router = useRouter();
const route = useRoute();
const usemenuStore = useMenuStore();
const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const authStore = useAuthStore();
const marketplaceChat = useMarketplaceChatStore();
const marketplaceOpening = ref(false);
const { t } = useI18n();
const { navigateToKnowledgeBaseList } = useKnowledgeBaseCreationNavigation();

const suggestedQuestions = ref<SuggestedQuestion[]>([]);
const sqLoading = ref(true);
const sqCardsRevealed = ref(false);
const sqRenderKey = ref(0);
const sqContainerRef = ref<HTMLElement | null>(null);
let suggestedQuestionsFetchId = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const onBeforeLeave = () => {
    const c = sqContainerRef.value;
    if (!c) return;
    c.style.height = c.offsetHeight + 'px';
    c.style.overflow = 'hidden';
};

const onAfterLeave = () => {
    const c = sqContainerRef.value;
    if (!c) return;
    if (suggestedQuestions.value.length === 0) {
        requestAnimationFrame(() => { c.style.height = '0px'; });
        c.addEventListener('transitionend', () => {
            c.style.height = '';
            c.style.overflow = '';
        }, { once: true });
    }
};

const onEnter = () => {
    const c = sqContainerRef.value;
    if (!c) return;
    const startHeight = c.offsetHeight;
    c.style.height = 'auto';
    c.style.overflow = 'hidden';
    const targetHeight = c.offsetHeight;
    c.style.height = startHeight + 'px';
    requestAnimationFrame(() => {
        c.style.height = targetHeight + 'px';
    });
};

const onQuestionsEntered = () => {
    const c = sqContainerRef.value;
    if (c) {
        c.style.height = '';
        c.style.overflow = '';
    }
    nextTick(() => { sqCardsRevealed.value = true; });
};

const fetchSuggestedQuestions = async () => {
    const fetchId = ++suggestedQuestionsFetchId;
    sqLoading.value = true;
    try {
        if (marketplaceOpening.value || route.query.marketplace_product || settingsStore.settings.marketplaceProductId) {
            suggestedQuestions.value = (marketplaceChat.product?.sample_questions || []).map(question => ({ question, source: 'agent_config' as const }));
            return;
        }
        const agentId = settingsStore.selectedAgentId;
        if (!agentId) return;
        const res = await getSuggestedQuestions(agentId, settingsStore.getSuggestedQuestionsParams());
        if (fetchId === suggestedQuestionsFetchId) {
            sqCardsRevealed.value = false;
            sqRenderKey.value++;
            suggestedQuestions.value = res?.data?.questions || [];
        }
    } catch (err) {
        console.warn('[SuggestedQuestions] Failed to fetch:', err);
        if (fetchId === suggestedQuestionsFetchId) {
            suggestedQuestions.value = [];
        }
    } finally {
        if (fetchId === suggestedQuestionsFetchId) {
            sqLoading.value = false;
        }
    }
};

const debouncedFetch = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { fetchSuggestedQuestions(); }, 300);
};

watch(
    () => ({
        agentId: settingsStore.selectedAgentId,
        kbs: settingsStore.settings.selectedKnowledgeBases,
        files: settingsStore.settings.selectedFiles,
        tags: settingsStore.settings.selectedTags,
        mcps: settingsStore.settings.selectedMCPServices,
        skills: settingsStore.settings.selectedSkills,
    }),
    debouncedFetch,
    { deep: true },
);

onMounted(() => { fetchSuggestedQuestions(); });
let marketplaceEntrySequence = 0;
watch(() => route.query.marketplace_product, async (raw) => {
    if (typeof raw !== 'string' || !raw) return;
    const run = ++marketplaceEntrySequence;
    const isCurrentEntry = () => run === marketplaceEntrySequence
        && route.name === 'globalCreatChat' && route.query.marketplace_product === raw;
    marketplaceOpening.value = true;
    try {
        const product = await marketplaceChat.load(raw, true);
        await nextTick();
        if (!isCurrentEntry()) return;
        if (!product.access?.can_chat) {
            MessagePlugin.warning(t('creatorMarketplace.noAccess'));
            await router.replace({ path: `/platform/marketplace/${raw}` });
            return;
        }
        await settingsStore.selectMarketplaceProduct({ productId: product.id, agentId: product.agent_id, knowledgeBaseIds: product.knowledge_base_ids });
        // Never write to the composer or send a question as a side effect of purchasing.
        suggestedQuestions.value = (product.sample_questions || []).map(question => ({ question, source: 'agent_config' as const }));
    } catch {
        if (isCurrentEntry()) {
            MessagePlugin.error(t('creatorMarketplace.loadFailed'));
            await router.replace({ path: `/platform/marketplace/${raw}` });
        }
    }
    finally {
        if (run === marketplaceEntrySequence) {
            marketplaceOpening.value = false;
            if (isCurrentEntry()) {
                const query = { ...route.query }; delete query.marketplace_product;
                await router.replace({ path: route.path, query });
            }
        }
    }
}, { immediate: true });
onUnmounted(() => { marketplaceEntrySequence++; if (debounceTimer) clearTimeout(debounceTimer); });

const inputFieldRef = ref();

const handleSuggestedQuestionClick = (question: string) => {
    inputFieldRef.value?.triggerSend(question);
};

const sendMsg = (value: string, modelId: string, mentionedItems: any[], imageFiles: any[] = [], attachmentFiles: any[] = [], thinking: boolean = true, reasoningEffort: string = '') => {
    createNewSession(value, modelId, mentionedItems, imageFiles, attachmentFiles, thinking, reasoningEffort);
}

async function createNewSession(value: string, modelId: string, mentionedItems: any[] = [], imageFiles: any[] = [], attachmentFiles: any[] = [], thinking: boolean = true, reasoningEffort: string = '') {
    const selectedKbs = settingsStore.settings.selectedKnowledgeBases || [];
    const selectedFiles = settingsStore.settings.selectedFiles || [];
    const sessionData: any = {};
    sessionData.agent_config = {
        enabled: true,
        max_iterations: settingsStore.agentConfig.maxIterations,
        temperature: settingsStore.agentConfig.temperature,
        knowledge_bases: selectedKbs,
        knowledge_ids: selectedFiles,
        allowed_tools: settingsStore.agentConfig.allowedTools
    };

    try {
        const res = await createSessions(sessionData);
        if (res.data && res.data.id) {
            await navigateToSession(res.data.id, value, modelId, mentionedItems, imageFiles, attachmentFiles, thinking, reasoningEffort);
        } else {
            console.error('[createChat] Failed to create session');
            MessagePlugin.error(t('createChat.messages.createFailed'));
        }
    } catch (error) {
        console.error('[createChat] Create session error:', error);
        MessagePlugin.error(t('createChat.messages.createError'));
    }
}

const navigateToSession = async (sessionId: string, value: string, modelId: string, mentionedItems: any[], imageFiles: any[] = [], attachmentFiles: any[] = [], thinking: boolean = true, reasoningEffort: string = '') => {
    const now = new Date().toISOString();
    let obj = {
        title: t('createChat.newSessionTitle'),
        path: `chat/${sessionId}`,
        id: sessionId,
        isMore: false,
        isNoTitle: true,
        created_at: now,
        updated_at: now
    };
    usemenuStore.updataMenuChildren(obj);
    usemenuStore.changeIsFirstSession(true);
    usemenuStore.changeFirstQuery(value, mentionedItems, modelId, imageFiles, attachmentFiles, thinking, reasoningEffort);
    router.push(`/platform/chat/${sessionId}`);
}

const handleKBEditorSuccess = (kbId: string) => {
    navigateToKnowledgeBaseList(kbId)
}

</script>
<style lang="less" scoped>
.visual-new-chat-view {
    flex: 1;
    min-width: 0;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    background: #fff;
    color: #1f2937;
    box-sizing: border-box;
}

.visual-new-chat-stack {
    width: min(768px, calc(100% - 64px));
    min-height: 100%;
    margin: 0 auto;
    padding: 64px 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: stretch;
    gap: 24px;
}

.visual-new-chat-title {
    margin: 0;
    padding: 0;
    text-align: center;
    font-family: var(--app-font-family);
    font-size: 32px;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: #111827;
}

.visual-new-chat-suggestions {
    width: 100%;
    min-height: 0;
    margin: 0;
    padding: 0;
    transition: height 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.visual-new-chat-suggestions__inner {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
}

.visual-new-chat-suggestions__heading {
    min-height: 20px;
    margin: 0 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #9ca3af;
    font-size: 13px;
    line-height: 20px;
    font-weight: 400;
    letter-spacing: .01em;
}

.visual-new-chat-suggestions__refresh {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    transition: color 150ms ease, background-color 150ms ease;

    &:hover:not(:disabled) {
        background: #f3f4f6;
        color: #4b5563;
    }

    &:disabled {
        cursor: default;
        opacity: .7;
    }

    :deep(.t-icon) {
        font-size: 12px;
    }
}

.is-spinning {
    animation: visual-new-chat-spin 800ms linear infinite;
}

.visual-new-chat-suggestions__list {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
}

.visual-new-chat-suggestion {
    appearance: none;
    min-width: 0;
    max-width: 100%;
    width: auto;
    min-height: 36px;
    padding: 8px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    color: #374151;
    box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
    font: inherit;
    cursor: pointer;
    opacity: 0;
    transform: translateY(8px) scale(.97);
    transition:
        opacity 160ms cubic-bezier(0.16, 1, 0.3, 1),
        transform 160ms cubic-bezier(0.16, 1, 0.3, 1),
        border-color 150ms ease,
        background-color 150ms ease,
        box-shadow 150ms ease;

    &.is-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
    }

    &:hover:not(.visual-new-chat-suggestion--skeleton) {
        border-color: #d1d5db;
        background: #f9fafb;
        box-shadow: 0 2px 6px rgb(0 0 0 / 5%);
    }

    &:active:not(.visual-new-chat-suggestion--skeleton) {
        transform: scale(.98);
    }
}

.visual-new-chat-suggestion--skeleton {
    width: 180px;
    opacity: 1;
    transform: none;
    pointer-events: none;
    border-color: transparent;
    background: #f3f4f6;
    box-shadow: none;

    &:nth-child(2n) { width: 240px; }
    &:nth-child(3n) { width: 150px; }
    &:nth-child(5n) { width: 210px; }
}

.visual-new-chat-suggestion__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    line-height: 18px;
    font-weight: 400;
}

.visual-new-chat-suggestion__badge {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: 5px;
    background: #f3f4f6;
    color: #9ca3af;
    font-size: 9px;
    line-height: 14px;
    font-weight: 600;
}

.visual-new-chat-composer {
    position: relative;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    z-index: 2;
}

.visual-new-chat-composer :deep(.visual-chat-composer),
.visual-new-chat-composer :deep(.visual-chat-composer__surface) {
    position: static !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    z-index: auto !important;
}

.visual-new-chat-suggestions-enter-active,
.visual-new-chat-suggestions-leave-active {
    transition: opacity 120ms ease, transform 120ms ease;
}

.visual-new-chat-suggestions-enter-from,
.visual-new-chat-suggestions-leave-to {
    opacity: 0;
    transform: translateY(4px);
}

@keyframes visual-new-chat-spin {
    to { transform: rotate(360deg); }
}

@media (max-width: 720px) {
    .visual-new-chat-stack {
        width: min(calc(100% - 32px), 768px);
        padding: 40px 0;
        gap: 20px;
    }

    .visual-new-chat-title {
        font-size: 28px;
    }
}

@media (max-width: 480px) {
    .visual-new-chat-stack {
        width: calc(100% - 24px);
        padding: 28px 0;
    }

    .visual-new-chat-title {
        font-size: 24px;
    }

    .visual-new-chat-suggestions__list {
        gap: 8px;
    }

    .visual-new-chat-suggestion {
        max-width: 100%;
    }
}

@media (prefers-reduced-motion: reduce) {
    .visual-new-chat-suggestions,
    .visual-new-chat-suggestion,
    .visual-new-chat-suggestions-enter-active,
    .visual-new-chat-suggestions-leave-active,
    .visual-new-chat-suggestions__refresh {
        transition: none !important;
    }
}
</style>

<style scoped>
.market-service-selection { box-sizing: border-box; display: flex; justify-content: space-between; gap: 18px; width: 100%; padding: 14px 16px; border: 1px solid var(--td-component-stroke); border-radius: 12px; font-size: 13px; color: var(--td-text-color-primary); }
.market-service-selection strong { font-weight: 600; }
.market-service-selection p { color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.6; margin: 6px 0 0; }
.market-service-selection .t-button { flex-shrink: 0; }
</style>
