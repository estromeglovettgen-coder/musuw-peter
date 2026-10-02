<template>
  <div class="system-prompt-settings">
    <header class="visual-settings-page-header">
      <div class="visual-settings-page-header__copy">
        <h2 class="visual-settings-page-header__title">
          系统提示词
          <PeterTermHelp label="生效范围" text="这是当前工作区的默认提示词。保存后用于新发起的生成任务；已有摘要和 Wiki 需重新生成。智能体自定义提示词优先于工作区默认值。模板变量用于传入资料、问题等实际内容，请保留。" />
        </h2>
        <p class="visual-settings-page-header__description">调整资料整理和智能体工作时使用的默认规则</p>
      </div>
    </header>

    <div v-if="loadError" class="prompt-error" role="alert">
      <span>{{ loadError }}</span>
      <t-button size="small" variant="text" :loading="loading" @click="loadPrompts">重试</t-button>
    </div>
    <div v-else-if="loading" class="prompt-loading"><t-loading size="small" /> 正在加载提示词</div>
    <template v-else-if="selectedPrompt">
      <div class="prompt-selectors">
        <label>
          <span>功能分类</span>
          <t-select :value="selectedGroup" :options="groupOptions" :disabled="saving" @change="changeGroup" />
        </label>
        <label>
          <span>提示词</span>
          <t-select :value="selectedId" :options="promptOptions" :disabled="saving" filterable @change="changePrompt" />
        </label>
      </div>

      <div class="prompt-description">
        <strong>{{ selectedPrompt.name }}</strong>
        <span class="prompt-state">{{ selectedPrompt.customized ? '已自定义' : '系统默认' }}</span>
        <p>{{ selectedPrompt.description }}</p>
      </div>
      <div v-if="selectedPrompt.variables.length" class="prompt-variables">
        <span>保留变量</span>
        <PeterTermHelp label="模板变量" text="这些变量会在运行时替换为实际资料。点击可插入光标位置；不要改写变量名称。" />
        <button
          v-for="variable in selectedPrompt.variables"
          :key="variable"
          type="button"
          class="prompt-variable"
          :disabled="!canEdit || saving"
          @click="insertVariable(variable)"
        >{{ variable }}</button>
      </div>
      <label for="system-prompt-content" class="prompt-content-label">提示词正文</label>
      <div ref="textareaContainer">
        <t-textarea
          id="system-prompt-content"
          v-model="draft"
          :disabled="!canEdit || saving"
          :autosize="{ minRows: 14, maxRows: 24 }"
          placeholder="输入这个功能应遵循的规则"
          class="system-prompt-textarea"
        />
      </div>
      <p v-if="validationError || saveError" class="prompt-error" role="alert">{{ saveError || validationError }}</p>
      <div class="prompt-actions">
        <span v-if="dirty" class="prompt-unsaved">有未保存的修改</span>
        <t-button variant="outline" :disabled="!canEdit || saving || (!selectedPrompt.customized && !dirty)" @click="confirmReset">恢复默认</t-button>
        <t-button theme="primary" :loading="saving" :disabled="!canEdit || !dirty || !!validationError" @click="savePrompt">保存</t-button>
      </div>
    </template>
    <p v-else class="prompt-loading">暂无可编辑的系统提示词</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { getSystemPrompts, updateSystemPrompt, type SystemPromptItem } from '@/api/system-prompts'
import PeterTermHelp from '@/components/PeterTermHelp.vue'
import { useAuthStore } from '@/stores/auth'
import { useEditorResourcesStore } from '@/stores/editorResources'

const authStore = useAuthStore()
const editorResources = useEditorResourcesStore()
const canEdit = computed(() => authStore.isSystemAdmin || authStore.canAccessAllTenants || authStore.hasRole('admin'))
const items = ref<SystemPromptItem[]>([])
const selectedId = ref('')
const selectedGroup = ref('')
const draft = ref('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const textareaContainer = ref<HTMLElement | null>(null)
const selectedPrompt = computed(() => items.value.find(item => item.id === selectedId.value))
const dirty = computed(() => !!selectedPrompt.value && draft.value !== selectedPrompt.value.content)
const groupOptions = computed(() => [...new Set(items.value.map(item => item.group))].map(group => ({ label: group, value: group })))
const promptOptions = computed(() => items.value.filter(item => item.group === selectedGroup.value).map(item => ({ label: item.name, value: item.id })))
const validationError = computed(() => {
  if (!draft.value.trim() || !selectedPrompt.value) return ''
  const missing = selectedPrompt.value.variables.filter(variable => !draft.value.includes(variable))
  return missing.length ? `请保留这些模板变量：${missing.join('、')}` : ''
})

function errorMessage(error: unknown, fallback: string): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback
}

function selectItem(id: string) {
  const item = items.value.find(candidate => candidate.id === id)
  selectedId.value = item?.id || ''
  selectedGroup.value = item?.group || ''
  draft.value = item?.content || ''
  saveError.value = ''
}

async function loadPrompts() {
  loading.value = true
  loadError.value = ''
  try {
    items.value = await getSystemPrompts()
    selectItem(items.value.some(item => item.id === selectedId.value) ? selectedId.value : items.value[0]?.id || '')
  } catch (error) {
    loadError.value = errorMessage(error, '系统提示词加载失败，请重试')
  } finally {
    loading.value = false
  }
}

let pendingLeave: Promise<boolean> | null = null
async function confirmLeave(): Promise<boolean> {
  if (saving.value) {
    MessagePlugin.warning('正在保存，请稍候')
    return false
  }
  if (!dirty.value) return true
  if (pendingLeave) return pendingLeave
  pendingLeave = new Promise<boolean>(resolve => {
    const dialog = DialogPlugin.confirm({
      header: '放弃未保存的修改？',
      body: '当前提示词还未保存，离开后这些修改将丢失。',
      confirmBtn: '放弃修改',
      cancelBtn: '继续编辑',
      zIndex: 1400,
      onConfirm: () => {
        draft.value = selectedPrompt.value?.content || ''
        dialog.destroy()
        resolve(true)
      },
      onClose: () => { dialog.destroy(); resolve(false) },
    })
  }).finally(() => { pendingLeave = null })
  return pendingLeave
}

async function changeGroup(value: unknown) {
  if (value === selectedGroup.value || !(await confirmLeave())) return
  selectItem(items.value.find(item => item.group === value)?.id || '')
}

async function changePrompt(value: unknown) {
  if (value === selectedId.value || !(await confirmLeave())) return
  selectItem(String(value))
}

async function insertVariable(variable: string) {
  if (!canEdit.value || saving.value) return
  const textarea = textareaContainer.value?.querySelector('textarea')
  const start = textarea?.selectionStart ?? draft.value.length
  const end = textarea?.selectionEnd ?? start
  draft.value = draft.value.slice(0, start) + variable + draft.value.slice(end)
  await nextTick()
  textarea?.focus()
  textarea?.setSelectionRange(start + variable.length, start + variable.length)
}

async function persist(content: string) {
  if (!selectedPrompt.value || !canEdit.value || saving.value) return
  saving.value = true
  saveError.value = ''
  const id = selectedId.value
  try {
    items.value = await updateSystemPrompt(id, content)
    selectItem(id)
    editorResources.invalidate('promptTemplates', 'agentTypePresets')
    MessagePlugin.success(content.trim() ? '系统提示词已保存' : '已恢复默认提示词')
    // Saved values are authoritative even if a secondary editor cache reload fails.
    await Promise.all([
      editorResources.ensurePromptTemplates(true),
      editorResources.ensureAgentTypePresets(true),
    ]).catch(() => MessagePlugin.warning('保存成功，智能体模板刷新失败；重新打开智能体编辑器可重试'))
  } catch (error) {
    saveError.value = errorMessage(error, '保存失败，请重试')
  } finally {
    saving.value = false
  }
}

function confirmReset() {
  if (!canEdit.value || saving.value) return
  const dialog = DialogPlugin.confirm({
    header: '恢复默认提示词？',
    body: `「${selectedPrompt.value?.name || ''}」将恢复为系统提供的默认规则，当前自定义内容会被替换。`,
    confirmBtn: '恢复默认',
    cancelBtn: '取消',
    zIndex: 1400,
    onConfirm: () => { dialog.destroy(); void persist('') },
    onClose: () => dialog.destroy(),
  })
}

function savePrompt() {
  if (!draft.value.trim()) return confirmReset()
  if (validationError.value) return
  void persist(draft.value)
}

function preventUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => { window.addEventListener('beforeunload', preventUnload); void loadPrompts() })
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventUnload))
defineExpose({ confirmLeave })
</script>

<style scoped lang="less">
.system-prompt-settings { min-width: 0; }
.prompt-selectors { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px; margin: 20px 0; }
.prompt-selectors label { min-width: 0; display: grid; gap: 8px; font-size: 13px; }
.prompt-description { margin: 16px 0; }
.prompt-description strong { font-size: 14px; }
.prompt-description p { margin: 8px 0; line-height: 1.6; font-size: 13px; color: var(--td-text-color-secondary); }
.prompt-state { margin-left: 10px; padding: 3px 8px; border-radius: 999px; font-size: 11px; color: var(--td-text-color-secondary); background: var(--td-bg-color-secondarycontainer); }
.prompt-variables { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 16px 0; font-size: 12px; color: var(--td-text-color-secondary); }
.prompt-variable { border: 1px solid var(--td-component-stroke); padding: 4px 8px; border-radius: 8px; background: var(--td-bg-color-container); color: var(--td-text-color-primary); font-family: monospace; cursor: pointer; overflow-wrap: anywhere; }
.prompt-variable:hover { background: var(--td-bg-color-container-hover); }
.prompt-variable:disabled { cursor: default; opacity: .5; }
.prompt-content-label { display: block; margin-bottom: 10px; font-size: 13px; }
.system-prompt-textarea { user-select: text; }
.system-prompt-textarea :deep(textarea) { font-size: 13px; line-height: 1.65; }
.prompt-actions { display: flex; gap: 12px; justify-content: flex-end; align-items: center; margin-top: 16px; }
.prompt-unsaved { margin-right: auto; color: var(--td-text-color-secondary); font-size: 12px; }
.prompt-error { display: flex; gap: 10px; align-items: center; color: var(--td-error-color); font-size: 13px; margin: 16px 0; overflow-wrap: anywhere; }
.prompt-loading { display: flex; justify-content: center; align-items: center; gap: 10px; min-height: 120px; color: var(--td-text-color-secondary); font-size: 13px; }
@media (max-width: 680px) { .prompt-selectors { grid-template-columns: 1fr; } }
</style>
