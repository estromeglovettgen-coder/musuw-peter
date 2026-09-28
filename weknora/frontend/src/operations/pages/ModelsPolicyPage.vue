<template>
  <div class="ops-page ops-model-policy">
    <header class="ops-page-header">
      <div>
        <h1>模型策略</h1>
        <p>为消费者配置五个真实模型边界。所有选项来自当前活动的内置 OpenRouter 模型目录，付费选项按列表顺序生效。</p>
      </div>
      <div class="ops-page-actions">
        <t-tag theme="primary" variant="light-outline">5 个边界</t-tag>
      </div>
    </header>

    <div v-if="loading && !data" class="ops-panel ops-loading">
      <t-loading text="加载真实模型策略" />
    </div>
    <div v-else-if="error && !data" class="ops-panel ops-error">
      <t-alert theme="error" title="模型策略加载失败" :message="error">
        <template #operation><t-button size="small" @click="load">重试</t-button></template>
      </t-alert>
    </div>
    <template v-else-if="data">
      <div v-if="!scenes.length" class="ops-panel ops-empty">
        <div>
          <span class="ops-empty__icon"><SettingIcon /></span>
          <h3>当前没有可用模型策略</h3>
          <p>模型策略接口没有返回固定边界；不会在运营台创建占位模型。</p>
        </div>
      </div>
      <section v-else class="ops-model-policy__scenes" aria-label="消费者模型策略">
        <article v-for="scene in scenes" :key="scene.scene" class="ops-panel ops-model-policy__scene">
          <header class="ops-panel__header ops-model-policy__scene-header">
            <div class="ops-panel__title">
              <h2>{{ scene.label }}</h2>
              <p>{{ scene.description }}</p>
            </div>
            <t-tag variant="light-outline">{{ scene.model_type }}</t-tag>
          </header>

          <div class="ops-panel__body ops-model-policy__body">
            <div class="ops-model-policy__field">
              <div class="ops-model-policy__field-info">
                <strong>Free 默认模型</strong>
                <span>Free 用户只能使用此边界的默认模型。</span>
              </div>
              <t-select
                :value="scene.free_default_model_id"
                :options="selectOptions(scene)"
                :loading="isSaving(scene.scene, 'free')"
                :disabled="isSaving(scene.scene, 'free') || !scene.options.length"
                class="ops-model-policy__select"
                aria-label="Free 默认模型"
                placeholder="选择真实模型"
                @change="onFreeChange(scene, $event)"
              />
            </div>

            <div class="ops-model-policy__field">
              <div class="ops-model-policy__field-info">
                <strong>付费模型（按顺序）</strong>
                <span>第一项是付费默认模型，后续项按此顺序展示和授权。</span>
              </div>
              <t-select
                :value="scene.paid_model_ids"
                :options="selectOptions(scene)"
                multiple
                :min-collapsed-num="3"
                :loading="isSaving(scene.scene, 'paid')"
                :disabled="isSaving(scene.scene, 'paid') || !scene.options.length"
                class="ops-model-policy__select ops-model-policy__select--paid"
                aria-label="付费模型（按顺序）"
                placeholder="选择付费模型"
                @change="onPaidChange(scene, $event)"
              />
              <span v-if="scene.paid_model_ids.length" class="ops-model-policy__paid-summary">
                当前已配置 {{ scene.paid_model_ids.length }} 项，第一项为付费默认模型。
              </span>
            </div>

            <div class="ops-model-policy__catalog" role="list" aria-label="真实模型目录">
              <div v-for="option in scene.options" :key="option.model_id" class="ops-model-policy__catalog-item" role="listitem">
                <div>
                  <strong>{{ option.display_name }}</strong>
                  <span class="ops-mono">{{ option.model_id }}</span>
                </div>
                <t-tag size="small" variant="light-outline">{{ option.model_type }}</t-tag>
              </div>
            </div>

            <div v-if="savingError(scene.scene)" class="ops-model-policy__save-error" role="alert">
              <InfoCircleIcon />
              <span>{{ savingError(scene.scene) }}</span>
            </div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { InfoCircleIcon, SettingIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { operationsApi } from '../api'
import { useOperationsReadRecovery } from '../useOperationsReadRecovery'
import type {
  ModelPolicyData,
  ModelPolicyOption,
  ModelPolicyScene,
  ModelPolicySceneKey,
  OperationsConfig,
} from '../types'

const props = defineProps<{ config: OperationsConfig | null; refreshKey: number }>()
const emit = defineEmits<{ busy: [value: boolean] }>()

const sceneOrder: ModelPolicySceneKey[] = ['rag', 'rerank', 'wiki', 'vision', 'asr']
const sceneDefaults: Record<ModelPolicySceneKey, { label: string; description: string }> = {
  rag: { label: '智能体模型', description: '知识库、Wiki 或网页检索后的最终答案生成。' },
  rerank: { label: 'Rerank', description: '对检索结果进行重排。' },
  wiki: { label: 'Wiki', description: 'Wiki 内容合成。' },
  vision: { label: '视觉模型', description: '图片、PDF 和其他视觉内容理解。' },
  asr: { label: '语音模型', description: '音频转文字。' },
}

const data = ref<ModelPolicyData | null>(null)
const loading = ref(false)
const error = ref('')
const saving = ref<Record<string, boolean>>({})
const saveErrors = ref<Record<string, string>>({})

const scenes = computed(() => {
  const byScene = new Map(data.value?.scenes.map((scene) => [scene.scene, scene]) || [])
  return sceneOrder
    .map((key) => {
      const scene = byScene.get(key)
      if (!scene) return null
      return {
        ...scene,
        label: scene.label || sceneDefaults[key].label,
        description: scene.description || sceneDefaults[key].description,
      }
    })
    .filter((scene): scene is ModelPolicyScene => Boolean(scene))
})

function selectOptions(scene: ModelPolicyScene) {
  return scene.options.map((option: ModelPolicyOption) => ({
    label: `${option.display_name} · ${option.model_type}`,
    value: option.model_id,
  }))
}

function normaliseId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normaliseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map(normaliseId)
    .filter((id) => id && !seen.has(id) && (seen.add(id), true))
}

function savingKey(scene: ModelPolicySceneKey, field: 'free' | 'paid') {
  return `${scene}:${field}`
}

function isSaving(scene: ModelPolicySceneKey, field: 'free' | 'paid') {
  return Boolean(saving.value[savingKey(scene, field)])
}

function savingError(scene: ModelPolicySceneKey) {
  return saveErrors.value[scene] || ''
}

function replaceScene(updated: ModelPolicyScene) {
  if (!data.value) return
  data.value = {
    scenes: data.value.scenes.map((scene) => scene.scene === updated.scene ? updated : scene),
  }
}

async function persist(scene: ModelPolicyScene, field: 'free' | 'paid', body: { free_default_model_id?: string; paid_model_ids?: string[] }) {
  const key = savingKey(scene.scene, field)
  saving.value = { ...saving.value, [key]: true }
  saveErrors.value = { ...saveErrors.value, [scene.scene]: '' }
  try {
    const updated = await operationsApi.updateModelPolicy(scene.scene, body)
    replaceScene(updated)
    MessagePlugin.success(`${scene.label}已更新`)
  } catch (saveError) {
    const message = saveError instanceof Error ? saveError.message : '保存失败'
    saveErrors.value = { ...saveErrors.value, [scene.scene]: message }
    MessagePlugin.error(`${scene.label}更新失败：${message}`)
  } finally {
    const next = { ...saving.value }
    delete next[key]
    saving.value = next
  }
}

function onFreeChange(scene: ModelPolicyScene, value: unknown) {
  const modelId = normaliseId(value)
  if (!modelId || modelId === scene.free_default_model_id) return
  void persist(scene, 'free', { free_default_model_id: modelId })
}

function onPaidChange(scene: ModelPolicyScene, value: unknown) {
  const modelIds = normaliseIds(value)
  if (!modelIds.length) {
    MessagePlugin.warning('至少保留一个付费模型')
    return
  }
  if (JSON.stringify(modelIds) === JSON.stringify(scene.paid_model_ids)) return
  void persist(scene, 'paid', { paid_model_ids: modelIds })
}

async function load() {
  loading.value = true
  error.value = ''
  emit('busy', true)
  try {
    data.value = await operationsApi.modelPolicy()
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : '加载失败'
  } finally {
    loading.value = false
    emit('busy', false)
  }
}

useOperationsReadRecovery(error, loading, load)
onMounted(load)
watch(() => props.refreshKey, load)
</script>
