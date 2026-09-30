<script setup lang="ts">
import { ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { getCustomerConfig, saveCustomerConfig, type CustomerConfig, type CustomerTemplate } from '@/api/customer'
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue'

const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ saved: [config: CustomerConfig] }>()
const config = ref<CustomerConfig>({ statuses: [], tags: [], templates: [] })
const draft = ref({ statuses: '', tags: '' })
const loading = ref(false), saving = ref(false), error = ref('')
const section = ref('templates')
const showTemplateEditor = ref(false)
const editingTemplate = ref<CustomerTemplate>()
const templateChanges = ref(false)
type ChoiceGroup = 'statuses' | 'tags'
const groups = [{ key: 'statuses', name: '客户状态', limit: 50 }, { key: 'tags', name: '客户标签', limit: 100 }] as const
const dragged = ref<{ group: ChoiceGroup; value: string } | null>(null)
const dropTarget = ref('')
let version = 0

async function load() {
  const run = ++version
  loading.value = true; error.value = ''
  try { const result = await getCustomerConfig(); if (run === version) config.value = result }
  catch (e: any) { if (run === version) error.value = e.message || '加载失败，请重试' }
  finally { if (run === version) loading.value = false }
}
watch(visible, value => {
  if (value) {
    draft.value = { statuses: '', tags: '' }
    section.value = 'templates'; templateChanges.value = false
    void load()
  } else {
    version++; showTemplateEditor.value = false; endDrag()
  }
})

function editTemplate(template?: CustomerTemplate) {
  if (!template && config.value.templates.length >= 50) return MessagePlugin.warning('客户模板不能超过 50 套')
  editingTemplate.value = template ? JSON.parse(JSON.stringify(template)) : undefined
  showTemplateEditor.value = true
}
function duplicateTemplate(template: CustomerTemplate) {
  if (config.value.templates.length >= 50) return MessagePlugin.warning('客户模板不能超过 50 套')
  const baseName = template.name.slice(0, 60)
  let name = `${baseName}（副本）`, index = 2
  while (config.value.templates.some(item => item.name === name)) name = `${baseName}（副本 ${index++}）`
  editTemplate({ ...template, id: crypto.randomUUID(), name })
}
function finishTemplate(template: CustomerTemplate) {
  const index = config.value.templates.findIndex(item => item.id === template.id)
  if (index < 0) config.value.templates.push(template)
  else config.value.templates.splice(index, 1, template)
  templateChanges.value = true
}
function removeTemplate(id: string) {
  config.value.templates = config.value.templates.filter(item => item.id !== id)
  templateChanges.value = true
}
function add(key: ChoiceGroup) {
  const value = draft.value[key].trim()
  if (!value) return
  if (config.value[key].length >= (key === 'statuses' ? 50 : 100)) return MessagePlugin.warning('选项数量已达上限')
  if (new TextEncoder().encode(value).length > 100) return MessagePlugin.warning('选项名称过长')
  if (config.value[key].includes(value)) return MessagePlugin.warning('此选项已存在')
  config.value[key].push(value); draft.value[key] = ''
}
function move(group: ChoiceGroup, value: string, to: number) {
  const list = config.value[group], from = list.indexOf(value)
  if (from < 0 || from === to || to < 0 || to >= list.length) return
  list.splice(to, 0, list.splice(from, 1)[0])
}
function startDrag(event: DragEvent, group: ChoiceGroup, value: string) {
  if (saving.value || !event.dataTransfer) return event.preventDefault()
  dragged.value = { group, value }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', value)
  const chip = (event.currentTarget as HTMLElement).closest('.choice')
  if (chip) event.dataTransfer.setDragImage(chip, 20, 15)
}
function dragOver(event: DragEvent, group: ChoiceGroup, value: string) {
  if (dragged.value?.group !== group) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = value
}
function drop(event: DragEvent, group: ChoiceGroup, value: string) {
  if (dragged.value?.group !== group) return
  event.preventDefault()
  move(group, dragged.value.value, config.value[group].indexOf(value))
  endDrag()
}
function endDrag() { dragged.value = null; dropTarget.value = '' }
function keyboardMove(event: KeyboardEvent, group: ChoiceGroup, value: string) {
  const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0
  if (!delta || saving.value) return
  event.preventDefault()
  move(group, value, config.value[group].indexOf(value) + delta)
}
function setVisible(value: boolean) { if (!saving.value && !showTemplateEditor.value) visible.value = value }
async function save() {
  if (saving.value || loading.value || error.value) return
  if (!config.value.statuses.length) { section.value = 'choices'; return MessagePlugin.warning('请至少保留一个客户状态') }
  if (draft.value.statuses.trim() || draft.value.tags.trim()) { section.value = 'choices'; return MessagePlugin.warning('请先添加或清空尚未加入的选项') }
  saving.value = true
  try { const result = await saveCustomerConfig(config.value); emit('saved', result); visible.value = false; MessagePlugin.success('客户设置已保存') }
  catch (e: any) { MessagePlugin.error(e.message || '保存失败') }
  finally { saving.value = false }
}
</script>

<template>
  <t-dialog :visible="visible && !showTemplateEditor" header="客户设置" width="720px" placement="center" :close-on-overlay-click="false" :close-on-esc-keydown="!saving" :close-btn="!saving" :confirm-btn="{ content: '保存', loading: saving, disabled: loading || !!error }" :cancel-btn="{ content: '取消', disabled: saving }" @update:visible="setVisible" @confirm="save">
    <t-loading v-if="loading" text="正在读取设置…" />
    <t-alert v-else-if="error" theme="error" :message="error"><template #operation><t-button variant="text" @click="load">重试</t-button></template></t-alert>
    <div v-else class="customer-settings" :class="{ 'is-saving': saving }">
      <t-radio-group v-model="section" variant="default-filled" class="settings-tabs" :disabled="saving">
        <t-radio-button value="templates">客户模板</t-radio-button>
        <t-radio-button value="choices">状态与标签</t-radio-button>
      </t-radio-group>
      <section v-if="section === 'templates'">
        <div class="template-heading"><h3>客户类型模板</h3><t-button variant="outline" :disabled="saving || config.templates.length >= 50" @click="editTemplate()"><template #icon><t-icon name="add" /></template>新建模板</t-button></div>
        <div v-if="!config.templates.length" class="template-empty">还没有模板</div>
        <div v-else class="template-list">
          <article v-for="template in config.templates" :key="template.id" class="template-row">
            <div class="template-copy"><strong>{{ template.name }}</strong><p v-if="template.description">{{ template.description }}</p></div>
            <div class="template-actions">
              <t-button variant="text" :aria-label="`编辑模板 ${template.name}`" :disabled="saving" @click="editTemplate(template)">编辑</t-button>
              <t-button variant="text" :aria-label="`复制模板 ${template.name}`" :disabled="saving" @click="duplicateTemplate(template)">复制</t-button>
              <t-button variant="text" theme="danger" :aria-label="`删除模板 ${template.name}`" :disabled="saving" @click="removeTemplate(template.id)">删除</t-button>
            </div>
          </article>
        </div>
        <p v-if="templateChanges" class="pending-note" role="status">模板已修改，点击下方“保存”生效。</p>
      </section>
      <template v-else>
        <section v-for="group in groups" :key="group.key">
          <h3>{{ group.name }}</h3>
          <p v-if="group.key === 'statuses'">拖动排序，第一个状态用于新建客户的默认值。</p>
          <div class="choices" :aria-label="group.name">
            <div v-for="(value, index) in config[group.key]" :key="value" class="choice" :class="{ 'is-dragging': dragged?.group === group.key && dragged.value === value, 'is-drop-target': dragged?.group === group.key && dropTarget === value && dragged.value !== value }" @dragenter="dragOver($event, group.key, value)" @dragover="dragOver($event, group.key, value)" @drop="drop($event, group.key, value)">
              <button type="button" class="drag-handle" draggable="true" :disabled="saving" :aria-label="`拖动排序 ${value}，第 ${index + 1} 项`" title="拖动排序，也可使用方向键" @dragstart="startDrag($event, group.key, value)" @dragend="endDrag" @keydown="keyboardMove($event, group.key, value)"><t-icon name="move" aria-hidden="true" /></button>
              <span>{{ value }}</span>
              <t-button variant="text" shape="square" size="small" :disabled="saving" :aria-label="`删除选项 ${value}`" @click="config[group.key].splice(index, 1)"><t-icon name="close" /></t-button>
            </div>
          </div>
          <div class="add-choice"><t-input v-model="draft[group.key]" :aria-label="`新增${group.name}`" :disabled="saving" :maxlength="30" :placeholder="`新增${group.name}`" @enter="add(group.key)" /><t-button variant="outline" :disabled="saving || config[group.key].length >= group.limit" @click="add(group.key)">添加</t-button></div>
        </section>
        <p>删除选项不会改动已有客户资料。</p>
      </template>
    </div>
  </t-dialog>
  <KnowledgeBaseEditorModal v-if="showTemplateEditor" v-model:visible="showTemplateEditor" mode="create" customer template-mode :customer-template="editingTemplate" :customer-choices="config" @template-save="finishTemplate" />
</template>

<style scoped>
h3{font-size:15px;margin:0 0 12px}p{font-size:13px;color:var(--td-text-color-secondary)}section+section{margin-top:28px}
.settings-tabs{margin-bottom:24px}.customer-settings{max-height:min(65vh,calc(100dvh - 220px));overflow-y:auto}.is-saving{pointer-events:none}
.template-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.template-heading h3{margin:0}
.template-empty{padding:48px 0;text-align:center;color:var(--td-text-color-placeholder)}.template-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid var(--td-component-stroke)}
.template-copy{min-width:0}.template-copy strong{font-size:14px;overflow-wrap:anywhere}.template-copy p{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.template-actions{display:flex;flex-shrink:0;gap:2px}.pending-note{margin:16px 0 0}
.choices{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.choice{display:flex;align-items:center;gap:6px;border:1px solid var(--td-component-border);border-radius:8px;padding:6px;font-size:13px;transition:border-color .15s,background .15s}.choice.is-dragging{opacity:.4}.choice.is-drop-target{border-color:var(--td-brand-color);background:var(--td-brand-color-light)}
.drag-handle{display:flex;align-items:center;justify-content:center;border:0;background:none;padding:4px;color:var(--td-text-color-placeholder);cursor:grab;touch-action:none}.drag-handle:active{cursor:grabbing}.drag-handle:focus-visible{outline:2px solid var(--td-brand-color);border-radius:4px}.add-choice{display:flex;gap:8px}.add-choice :deep(.t-input__wrap){flex:1}
@media(max-width:640px){.template-row{align-items:flex-start;flex-direction:column;gap:8px}.template-actions{align-self:flex-end}}
</style>
