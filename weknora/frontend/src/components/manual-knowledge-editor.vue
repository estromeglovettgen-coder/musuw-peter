<script lang="ts">
import { defineComponent, type SetupContext } from 'vue'
import SettingDrawer from '@/components/settings/SettingDrawer.vue'
import LegacyManualEditorBusiness from '@/assets/business-baselines/manual-knowledge-editor.pre-view.vue'

const legacy = LegacyManualEditorBusiness as any
const legacySetup = legacy.setup

export default defineComponent({
  ...legacy,
  name: 'ManualKnowledgeEditor',
  setup(props: Record<string, unknown>, context: SetupContext) {
    const state = legacySetup?.(props, context)
    if (state && typeof state === 'object' && typeof state.then !== 'function') {
      return { ...state }
    }
    return state
  },
  components: {
    ...(legacy.components || {}),
    SettingDrawer,
  },
})
</script>

<template>
  <SettingDrawer
    class="manual-editor-drawer"
    :visible="visible"
    :title="dialogTitle"
    :description="$t('manualEditor.description')"
    icon="edit-1"
    width="760px"
    :min-width="560"
    :max-width="1280"
    storage-key="setting-drawer:width:manual-markdown-editor"
    :hide-footer="!initialLoaded"
    @update:visible="(v: boolean) => { visible = v }"
  >
    <template #footer-left>
      <div class="manual-editor-footer-meta">
        <t-tag size="small" theme="warning" variant="light" v-if="form.status === 'draft'">
          {{ $t('manualEditor.status.draftTag') }}
        </t-tag>
        <t-tag size="small" theme="success" variant="light" v-else>
          {{ $t('manualEditor.status.publishedTag') }}
        </t-tag>
      </div>
    </template>

    <template #footer-right>
      <div class="manual-editor-footer-actions">
        <t-button
          theme="default"
          variant="outline"
          class="manual-editor-cancel-btn"
          :disabled="saving"
          @click="handleClose"
        >
          {{ $t('manualEditor.actions.cancel') }}
        </t-button>
        <t-button
          variant="outline"
          theme="default"
          @click="handleSave('draft')"
          :loading="saving && savingAction === 'draft'"
          :disabled="saving && savingAction !== 'draft'"
        >
          {{ $t('manualEditor.actions.saveDraft') }}
        </t-button>
        <t-button
          theme="primary"
          @click="handleSave('publish')"
          :loading="saving && savingAction === 'publish'"
          :disabled="saving && savingAction !== 'publish'"
        >
          {{ $t('manualEditor.actions.publish') }}
        </t-button>
      </div>
    </template>

    <div class="manual-editor" v-if="initialLoaded">
      <section class="setting-drawer__section">
        <h4 class="setting-drawer__section-title">{{ $t('manualEditor.section.basic') }}</h4>

        <div class="form-item">
          <label class="form-label required">{{ $t('manualEditor.form.titleLabel') }}</label>
          <t-input
            v-model="form.title"
            maxlength="100"
            :placeholder="$t('manualEditor.form.titlePlaceholder')"
            showLimitNumber
          />
        </div>

        <div class="form-item">
          <label class="form-label required">{{ $t('manualEditor.form.knowledgeBaseLabel') }}</label>
          <div class="kb-row">
            <t-select
              v-model="form.kbId"
              :disabled="kbDisabled"
              :loading="kbLoading"
              :options="kbOptions"
              :placeholder="$t('manualEditor.form.knowledgeBasePlaceholder')"
              :popup-props="{ attach: 'body', zIndex: 2600 }"
            >
              <template #empty>
                <div style="padding: 20px; text-align: center; color: var(--td-text-color-placeholder);">
                  {{ $t('manualEditor.noDocumentKnowledgeBases') }}
                </div>
              </template>
            </t-select>
            <div class="status-row" v-if="mode === 'edit'">
              <t-tag size="small" theme="warning" variant="light" v-if="form.status === 'draft'">
                {{ $t('manualEditor.status.draftTag') }}
              </t-tag>
              <t-tag size="small" theme="success" variant="light" v-else>
                {{ $t('manualEditor.status.publishedTag') }}
              </t-tag>
            </div>
          </div>
          <p v-if="lastUpdatedText" class="form-desc">{{ lastUpdatedText }}</p>
        </div>
      </section>

      <section class="setting-drawer__section editor-section">
        <h4 class="setting-drawer__section-title">{{ $t('manualEditor.section.content') }}</h4>

        <div class="editor-area">
          <div class="editor-toolbar">
            <div class="editor-toolbar__format">
              <template v-for="(group, groupIndex) in toolbarGroups" :key="group.key">
                <div class="toolbar-group">
                  <template v-for="btn in group.buttons" :key="btn.key">
                    <t-tooltip :content="btn.tooltip" placement="top">
                      <button
                        type="button"
                        class="toolbar-btn"
                        :class="`btn-${btn.key}`"
                        @mousedown.prevent
                        @click="handleToolbarAction(btn.action)"
                      >
                        <t-icon :name="btn.icon" size="18px" />
                      </button>
                    </t-tooltip>
                  </template>
                </div>
                <div
                  v-if="Number(groupIndex) < toolbarGroups.length - 1"
                  class="toolbar-divider"
                ></div>
              </template>
            </div>
            <div class="editor-toolbar__view">
              <t-button
                variant="text"
                theme="primary"
                size="small"
                :class="['toggle-view-btn', { 'is-preview': isPreviewMode }]"
                :disabled="saving"
                @click="toggleEditorView"
              >
                <template #icon><t-icon :name="viewToggleIcon" /></template>
                {{ viewToggleLabel }}
              </t-button>
            </div>
          </div>

          <div class="editor-pane" v-show="activeTab === 'edit'">
            <t-textarea
              ref="textareaComponent"
              v-if="!contentLoading"
              v-model="form.content"
              :placeholder="$t('manualEditor.form.contentPlaceholder')"
              class="editor-textarea"
            />
            <div v-else class="loading-placeholder">
              <t-loading size="small" :text="$t('manualEditor.loading.content')" />
            </div>
          </div>
          <div class="editor-pane editor-pane--preview" v-show="activeTab === 'preview'">
            <div class="preview-container" v-html="previewHTML" />
          </div>
        </div>
      </section>
    </div>
    <div v-else class="loading-wrapper">
      <t-loading size="medium" :text="$t('manualEditor.loading.preparing')" />
    </div>
  </SettingDrawer>
</template>

<style scoped lang="less">
/* 复用模型管理同款 SettingDrawer：分组 section / header 图标 / footer 按钮 / 拖拽调宽。
   这里只负责本编辑器特有的内容样式。内容内联渲染（无 teleport），scoped 生效。 */
.manual-editor {
  display: flex;
  flex-direction: column;
  --manual-editor-accent: var(--musuw-accent);
  --manual-editor-accent-soft: var(--musuw-accent-soft);
}

.manual-editor-footer-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--td-text-color-placeholder);
}

.manual-editor-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;

  :deep(.t-button) {
    min-width: 88px;
  }
}

.manual-editor-cancel-btn {
  border-color: transparent;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    border-color: var(--td-component-stroke);
    background: var(--td-bg-color-container-hover);
    color: var(--td-text-color-primary);
  }
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-primary);

  &.required::after {
    content: '*';
    margin-left: 4px;
    color: var(--td-error-color);
  }
}

.form-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.kb-row {
  display: flex;
  align-items: center;
  gap: 12px;

  :deep(.t-select) {
    flex: 1;
    min-width: 0;
  }
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 内容分组：让编辑区占满，无需依赖父级 flex 链路，直接用视口高度，稳健 */
.editor-section {
  flex: 1;
  min-height: 0;
}

.editor-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  background: var(--td-bg-color-secondarycontainer);
  border-bottom: 1px solid var(--td-component-stroke);
  overflow: hidden;
  flex-shrink: 0;
}

.editor-toolbar__format {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.editor-toolbar__view {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-left: 8px;
  border-left: 1px solid var(--td-component-stroke);
}

.toggle-view-btn {
  min-width: 92px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 7px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    border-color: var(--manual-editor-accent);
    background: var(--manual-editor-accent-soft);
    color: var(--manual-editor-accent);
    box-shadow: none;
  }

  &.is-preview {
    border-color: var(--manual-editor-accent);
    background: var(--manual-editor-accent-soft);
    color: var(--manual-editor-accent);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: none;
  }

  :deep(.t-button__icon) {
    margin-right: 5px;
    font-size: 15px;
  }
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--td-component-stroke);
  margin: 0 4px;
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  color: var(--td-text-color-secondary);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  .t-icon {
    color: var(--td-text-color-secondary);
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}

.toolbar-btn:hover {
  background: var(--manual-editor-accent-soft);
  color: var(--manual-editor-accent);

  .t-icon {
    color: var(--manual-editor-accent);
  }
}

.toolbar-btn.active {
  background: var(--manual-editor-accent-soft);
  color: var(--manual-editor-accent);

  .t-icon {
    color: var(--manual-editor-accent);
  }
}

.toolbar-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--manual-editor-accent) 24%, transparent);
}

.toolbar-btn:active {
  background: var(--manual-editor-accent-soft);
  transform: translateY(0.5px);
}

.editor-area {
  /* 抽屉为整屏高，减去 header/footer/基本信息分组的大致高度，
     让编辑区占据剩余空间且不必撑满父级 flex 链路。 */
  height: calc(100vh - 360px);
  min-height: 280px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  overflow: hidden;
  background: var(--td-bg-color-container);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus-within {
    border-color: var(--manual-editor-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--manual-editor-accent) 12%, transparent);
  }
}

.editor-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--td-bg-color-container);
}

:deep(.editor-textarea) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;

  .t-textarea__inner {
    flex: 1;
    height: 100% !important;
    resize: none;
    border: none;
    border-radius: 0;
    padding: 14px 16px;
    font-family: var(--app-font-family-mono);
    font-size: 14px;
    line-height: 1.7;
    background: var(--td-bg-color-container);

    &:focus {
      box-shadow: none;
    }
  }
}

.editor-pane--preview {
  background: var(--td-bg-color-container);
}

.preview-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  background: var(--td-bg-color-container);
  font-size: 14px;
  line-height: 1.7;
  color: var(--td-text-color-primary);

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin-top: 16px;
    margin-bottom: 8px;
  }

  :deep(code) {
    background: var(--td-bg-color-container-hover);
    padding: 2px 4px;
    border-radius: 4px;
    font-family: var(--app-font-family-mono);
  }

  :deep(pre) {
    background: var(--td-bg-color-container-hover);
    padding: 12px;
    border-radius: 6px;
    overflow: auto;
  }

  :deep(blockquote) {
    border-left: 4px solid var(--manual-editor-accent);
    padding-left: 12px;
    color: var(--td-text-color-secondary);
    margin: 16px 0;
    background: var(--manual-editor-accent-soft);
  }

  :deep(a) {
    color: var(--manual-editor-accent);
  }
}

.loading-wrapper,
.loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 280px;
  padding: 20px;
}

.empty-preview {
  color: var(--td-text-color-placeholder);
}
</style>

<style lang="less">
:root[theme-mode="dark"] body .t-drawer.manual-editor-drawer {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

:root[theme-mode="dark"] body .t-drawer.manual-editor-drawer > .t-drawer__content-wrapper {
  border-left: 1px solid var(--mvc-line) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
  box-shadow: -18px 0 50px rgb(0 0 0 / 36%) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-drawer__header,
:root[theme-mode="dark"] body .manual-editor-drawer .t-drawer__body {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .setting-drawer__header-icon {
  border: 1px solid var(--mvc-line) !important;
  background: var(--mvc-surface-raised) !important;
  color: var(--mvc-muted-strong) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .setting-drawer__title,
:root[theme-mode="dark"] body .manual-editor-drawer .setting-drawer__section-title,
:root[theme-mode="dark"] body .manual-editor-drawer .form-label {
  color: var(--mvc-text-strong) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .setting-drawer__subtitle,
:root[theme-mode="dark"] body .manual-editor-drawer .form-desc,
:root[theme-mode="dark"] body .manual-editor-drawer .t-input__suffix {
  color: var(--mvc-muted) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .setting-drawer__section,
:root[theme-mode="dark"] body .manual-editor-drawer .editor-toolbar {
  border-color: var(--mvc-line) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-input,
:root[theme-mode="dark"] body .manual-editor-drawer .t-textarea__inner {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface-raised) !important;
  color: var(--mvc-text) !important;
  box-shadow: none !important;
}
:root[theme-mode="dark"] body .manual-editor-drawer .t-select-input {
  border: 0 !important;
  background: transparent !important;
  color: inherit !important;
  box-shadow: none !important;
}
:root[theme-mode="dark"] body .manual-editor-drawer .t-select-input .t-input {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface-raised) !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-input:hover,
:root[theme-mode="dark"] body .manual-editor-drawer .t-textarea__inner:hover {
  border-color: var(--mvc-line-strong) !important;
}
:root[theme-mode="dark"] body .manual-editor-drawer .t-select-input:hover .t-input {
  border-color: var(--mvc-line-strong) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-input__inner,
:root[theme-mode="dark"] body .manual-editor-drawer .t-textarea__inner {
  color: var(--mvc-text) !important;
  caret-color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-input__inner::placeholder,
:root[theme-mode="dark"] body .manual-editor-drawer .t-textarea__inner::placeholder {
  color: var(--mvc-faint) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .editor-area,
:root[theme-mode="dark"] body .manual-editor-drawer .editor-pane,
:root[theme-mode="dark"] body .manual-editor-drawer .preview-container {
  border-color: var(--mvc-line) !important;
  background: var(--mvc-surface-raised) !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .editor-toolbar {
  background: var(--mvc-hover) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .toolbar-btn {
  color: var(--mvc-muted-strong) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .toolbar-btn:hover,
:root[theme-mode="dark"] body .manual-editor-drawer .toolbar-btn:focus-visible {
  background: var(--mvc-active) !important;
  color: var(--mvc-text-strong) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-drawer__footer {
  border-top-color: var(--mvc-line) !important;
  background: var(--mvc-surface-raised) !important;
  color: var(--mvc-text) !important;
  box-shadow: 0 -1px 0 var(--mvc-line) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-drawer__footer .t-button--theme-default {
  border-color: var(--mvc-line-strong) !important;
  background: var(--mvc-surface) !important;
  color: var(--mvc-text) !important;
}

:root[theme-mode="dark"] body .manual-editor-drawer .t-drawer__footer .t-button--theme-primary {
  border-color: var(--mvc-text-strong) !important;
  background: var(--mvc-text-strong) !important;
  color: var(--mvc-page) !important;
}
</style>
