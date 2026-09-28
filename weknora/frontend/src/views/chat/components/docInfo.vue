<template>
  <section
    v-if="session.knowledge_references && session.knowledge_references.length"
    class="visual-answer-references"
    :class="{ 'is-timeline': timelineMode, 'is-content-only': contentOnly }"
  >
    <button
      v-if="!contentOnly"
      type="button"
      class="visual-answer-references__header"
      @click="referBoxSwitch"
    >
      <span class="visual-answer-references__header-icon" aria-hidden="true">
        <t-icon v-if="!timelineMode" name="file" />
      </span>
      <span class="visual-answer-references__header-text">{{ headerText }}</span>
      <t-icon :name="showReferBox ? 'chevron-down' : 'chevron-right'" class="visual-answer-references__chevron" />
    </button>

    <div v-show="contentOnly || showReferBox" class="visual-answer-references__body">
      <a
        v-for="(item, index) in webSearchRefs"
        :key="'web-' + index"
        :href="getWebSearchUrl(item)"
        target="_blank"
        rel="noopener noreferrer"
        class="visual-answer-reference-web"
        @click.stop
      >
        <span class="visual-answer-reference-web__icon"><t-icon name="link" /></span>
        <span>
          {{ webSearchRefs.length < 2
            ? getWebSearchDisplayText(item)
            : `${index + 1}. ${getWebSearchDisplayText(item)}` }}
        </span>
      </a>

      <article
        v-for="(group, gIdx) in groupedKnowledgeRefs"
        :key="'grp-' + gIdx"
        class="visual-answer-reference-doc"
      >
        <button type="button" class="visual-answer-reference-doc__header" @click="toggleGroup(group.key)">
          <span class="visual-answer-reference-doc__icon" aria-hidden="true"><t-icon name="file" /></span>
          <span class="visual-answer-reference-doc__title" :title="group.title">{{ group.title }}</span>
          <span class="visual-answer-reference-doc__count">
            {{ $t('chat.referenceChunkCount', { count: group.chunks.length }) }}
          </span>
          <t-icon :name="expandedGroups[group.key] ? 'chevron-down' : 'chevron-right'" class="visual-answer-reference-doc__chevron" />
        </button>

        <a
          v-if="!embeddedMode && !marketplaceActive && group.knowledgeBaseId"
          class="visual-answer-reference-doc__navigate"
          :href="getDocumentHref(group)"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="$t('chat.navigateToDocument')"
          :title="$t('chat.navigateToDocument')"
          @click.stop
        >
          <t-icon name="jump" />
        </a>

        <div v-show="expandedGroups[group.key]" class="visual-answer-reference-doc__chunks">
          <t-popup
            v-for="(chunk, cIdx) in group.chunks"
            :key="'chunk-' + cIdx"
            overlayClassName="visual-answer-reference-popup"
            placement="bottom-left"
            width="400"
            :showArrow="false"
            trigger="click"
          >
            <template #content>
              <ContentPopup :content="safeProcessContent(chunk.content)" :is-html="true" />
            </template>
            <button type="button" class="visual-answer-reference-chunk">
              <span>{{ $t('chat.chunkLabel', { index: cIdx + 1 }) }}</span>
              <span>{{ truncateContent(chunk.content, 80) }}</span>
            </button>
          </t-popup>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, reactive } from "vue";
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { sanitizeHTML } from '@/utils/security';
import ContentPopup from './tool-results/ContentPopup.vue';
import { useChatReferencesDrawer } from '@/composables/useChatReferencesDrawer';

const router = useRouter();
const { t } = useI18n();
const referencesDrawer = useChatReferencesDrawer();

const props = defineProps({
    content: { type: String, required: false },
    session: { type: Object, required: false },
    embeddedMode: { type: Boolean, default: false },
    timelineMode: { type: Boolean, default: false },
    contentOnly: { type: Boolean, default: false }
});

const marketplaceActive = computed(() => Boolean(props.session?.marketplace_product_id));
const showReferBox = ref(false);
const expandedGroups = reactive({});

const referBoxSwitch = () => {
    const refs = props.session?.knowledge_references;
    if (referencesDrawer && refs?.length) {
        referencesDrawer.open({ references: refs, messageId: props.session?.id, marketplaceProductId: props.session?.marketplace_product_id });
        return;
    }
    showReferBox.value = !showReferBox.value;
};

const toggleGroup = (key) => { expandedGroups[key] = !expandedGroups[key]; };

const webSearchRefs = computed(() => {
    if (!props.session?.knowledge_references) return [];
    return props.session.knowledge_references.filter(item => item.chunk_type === 'web_search');
});

const knowledgeRefs = computed(() => {
    if (!props.session?.knowledge_references) return [];
    return props.session.knowledge_references.filter(item => item.chunk_type !== 'web_search');
});

const groupedKnowledgeRefs = computed(() => {
    const refs = knowledgeRefs.value;
    if (!refs.length) return [];
    const groupMap = new Map();
    for (const item of refs) {
        const key = item.knowledge_id || item.knowledge_title || item.id;
        if (!groupMap.has(key)) {
            groupMap.set(key, {
                key,
                title: item.knowledge_title || item.knowledge_filename || key,
                knowledgeId: item.knowledge_id,
                knowledgeBaseId: item.knowledge_base_id,
                chunks: [],
            });
        }
        groupMap.get(key).chunks.push(item);
    }
    return Array.from(groupMap.values());
});

const headerText = computed(() => {
    const total = props.session?.knowledge_references?.length ?? 0;
    const docCount = groupedKnowledgeRefs.value.length;
    const webCount = webSearchRefs.value.length;
    if (docCount > 0 && webCount > 0) return t('chat.referencesDocAndWebCount', { docCount, webCount });
    if (docCount > 0) return t('chat.referencesDocCount', { count: docCount });
    if (webCount > 0) return t('chat.referencesWebCount', { count: webCount });
    return t('chat.referencesTitle', { count: total });
});

const safeProcessContent = (content) => {
    if (!content) return '';
    const sanitized = sanitizeHTML(content);
    return sanitized.replace(/\n/g, '<br/>');
};

const truncateContent = (content, maxLen) => {
    if (!content) return '';
    const text = content.replace(/\n/g, ' ').trim();
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
};

const getDocumentHref = (group) => {
    if (!group.knowledgeBaseId) return '';
    const query = {};
    if (group.knowledgeId) query.knowledge_id = group.knowledgeId;
    return router.resolve({
        path: `/platform/knowledge-bases/${group.knowledgeBaseId}`,
        query
    }).href;
};

const getWebSearchUrl = (item) => {
    if (item.metadata?.url) return item.metadata.url;
    if (item.id && (item.id.startsWith('http://') || item.id.startsWith('https://'))) return item.id;
    return '#';
};

const getWebSearchDisplayText = (item) => {
    if (item.knowledge_title) return item.knowledge_title;
    if (item.metadata?.title) return item.metadata.title;
    const url = getWebSearchUrl(item);
    if (url && url !== '#') {
        try { return new URL(url).hostname; }
        catch { return url; }
    }
    return 'Web Search Result';
};
</script>

<style scoped lang="less">
.visual-answer-references { width: 100%; margin-bottom: 8px; box-sizing: border-box; border: 1px solid #e5e7eb; border-radius: 11px; overflow: hidden; background: #fff; color: #374151; }
.visual-answer-references__header { width: 100%; min-height: 34px; padding: 7px 9px; border: 0; display: flex; align-items: center; gap: 7px; background: transparent; color: #6b7280; font: inherit; text-align: left; cursor: pointer; }
.visual-answer-references__header:hover { background: #f9fafb; color: #374151; }
.visual-answer-references__header-icon { flex: 0 0 16px; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; color: #9ca3af; }
.visual-answer-references__header-icon :deep(.t-icon) { font-size: 13px; }
.visual-answer-references__header-text { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 16px; font-weight: 600; }
.visual-answer-references__chevron { flex: 0 0 11px; font-size: 11px; color: #9ca3af; }
.visual-answer-references__body { padding: 4px 7px 8px; border-top: 1px solid #f3f4f6; }
.visual-answer-reference-web { min-height: 30px; padding: 5px 7px; border-radius: 8px; display: flex; align-items: center; gap: 7px; color: #6b7280; font-size: 10px; line-height: 16px; text-decoration: none; }
.visual-answer-reference-web:hover { background: #f9fafb; color: #111827; }
.visual-answer-reference-web__icon { flex: 0 0 22px; width: 22px; height: 22px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af; }
.visual-answer-reference-web__icon :deep(.t-icon) { font-size: 11px; }
.visual-answer-reference-web > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-answer-reference-doc { position: relative; border-radius: 9px; }
.visual-answer-reference-doc + .visual-answer-reference-doc { margin-top: 2px; }
.visual-answer-reference-doc:hover { background: #f9fafb; }
.visual-answer-reference-doc__header { width: 100%; min-height: 34px; padding: 6px 34px 6px 7px; border: 0; border-radius: 9px; display: flex; align-items: center; gap: 7px; background: transparent; color: #374151; font: inherit; text-align: left; cursor: pointer; }
.visual-answer-reference-doc__icon { flex: 0 0 24px; width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af; }
.visual-answer-reference-doc__icon :deep(.t-icon) { font-size: 11px; }
.visual-answer-reference-doc__title { min-width: 0; flex: 1; overflow: hidden; color: #111827; font-size: 10px; line-height: 16px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.visual-answer-reference-doc__count { flex: 0 0 auto; color: #9ca3af; font-size: 9px; line-height: 14px; }
.visual-answer-reference-doc__chevron { flex: 0 0 10px; font-size: 10px; color: #9ca3af; }
.visual-answer-reference-doc__navigate { position: absolute; top: 5px; right: 5px; z-index: 2; width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; text-decoration: none; opacity: 0; }
.visual-answer-reference-doc:hover .visual-answer-reference-doc__navigate,.visual-answer-reference-doc__navigate:focus-visible { opacity: 1; }
.visual-answer-reference-doc__navigate:hover { background: #fff; color: #374151; }
.visual-answer-reference-doc__navigate :deep(.t-icon) { font-size: 11px; }
.visual-answer-reference-doc__chunks { padding: 0 7px 6px 38px; }
.visual-answer-reference-chunk { width: 100%; min-height: 28px; padding: 4px 6px; border: 0; border-radius: 7px; display: flex; align-items: baseline; gap: 6px; background: transparent; color: #6b7280; font: inherit; font-size: 9px; line-height: 15px; text-align: left; cursor: pointer; }
.visual-answer-reference-chunk:hover { background: #f3f4f6; color: #374151; }
.visual-answer-reference-chunk > span:first-child { flex: 0 0 auto; color: #9ca3af; }
.visual-answer-reference-chunk > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-answer-references.is-timeline { margin: 0; border: 0; border-radius: 0; background: transparent; }
.visual-answer-references.is-timeline .visual-answer-references__header { padding: 2px 0; color: #6b7280; }
.visual-answer-references.is-timeline .visual-answer-references__header-icon { display: none; }
.visual-answer-references.is-timeline .visual-answer-references__header-text { font-size: 11px; font-weight: 500; white-space: normal; }
.visual-answer-references.is-timeline .visual-answer-references__body { padding: 2px 0 0; border: 0; }
.visual-answer-references.is-content-only { border: 0; background: transparent; }
.visual-answer-references.is-content-only .visual-answer-references__body { padding: 0; border: 0; }
</style>

<style>
.visual-answer-reference-popup { z-index: 10050 !important; }
.visual-answer-reference-popup .t-popup__content { padding: 0 !important; border: 1px solid #e5e7eb !important; border-radius: 12px !important; background: #fff !important; box-shadow: 0 14px 34px rgb(15 23 42 / 14%) !important; }
</style>
