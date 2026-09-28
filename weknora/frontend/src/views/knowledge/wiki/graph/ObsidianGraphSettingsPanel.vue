<template>
  <div class="obsidian-graph-controls-wrap">
    <button
      v-if="modelValue.close"
      type="button"
      class="graph-settings-trigger legend-action"
      :title="t('knowledgeEditor.wikiBrowser.obsidianGraph.open')"
      :aria-label="t('knowledgeEditor.wikiBrowser.obsidianGraph.open')"
      :aria-expanded="!modelValue.close"
      @click="update('close', false)"
    >
      <span class="legend-action-icon"><t-icon name="setting" /></span>
      <span>{{ t('knowledgeEditor.wikiBrowser.obsidianGraph.settings') }}</span>
    </button>

    <div v-else class="graph-controls">
      <div class="graph-controls-actions">
        <button
          type="button"
          class="clickable-icon"
          :title="t('knowledgeEditor.wikiBrowser.obsidianGraph.reset')"
          :aria-label="t('knowledgeEditor.wikiBrowser.obsidianGraph.reset')"
          @click="emit('reset')"
        >
          <t-icon name="rollback" />
        </button>
        <button
          type="button"
          class="clickable-icon"
          :title="t('knowledgeEditor.wikiBrowser.obsidianGraph.close')"
          :aria-label="t('knowledgeEditor.wikiBrowser.obsidianGraph.close')"
          @click="update('close', true)"
        >
          <t-icon name="close" />
        </button>
      </div>

      <section class="graph-control-section">
        <button type="button" class="tree-item-self" @click="toggleCollapse('collapse-display')">
          <t-icon :name="modelValue['collapse-display'] ? 'chevron-right' : 'chevron-down'" />
          <span>{{ t('knowledgeEditor.wikiBrowser.obsidianGraph.display') }}</span>
        </button>
        <div v-if="!modelValue['collapse-display']" class="tree-item-children">
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.textFade')"
            :value="modelValue.textFadeMultiplier"
            :min="-3"
            :max="3"
            :step="0.1"
            @change="update('textFadeMultiplier', $event)"
          />
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.nodeSize')"
            :value="modelValue.nodeSizeMultiplier"
            :min="0.1"
            :max="5"
            :step="0.1"
            @change="update('nodeSizeMultiplier', $event)"
          />
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.linkThickness')"
            :value="modelValue.lineSizeMultiplier"
            :min="0.1"
            :max="5"
            :step="0.1"
            @change="update('lineSizeMultiplier', $event)"
          />
        </div>
      </section>

      <section class="graph-control-section graph-playback-section">
        <div class="graph-playback-heading">
          <div class="graph-playback-title">
            <t-icon name="animation-1" />
            <span>{{ t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackTitle') }}</span>
          </div>
          <span class="graph-playback-progress" aria-live="polite">
            {{ t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackProgress', {
              visible: playback.visible,
              total: playback.total,
            }) }}
          </span>
        </div>
        <p class="graph-playback-description">
          {{ t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackDescription') }}
        </p>
        <div class="graph-playback-actions">
          <button
            type="button"
            class="playback-button"
            :disabled="playback.total === 0"
            :aria-label="playbackActionLabel"
            @click="handlePlaybackAction"
          >
            <t-icon :name="playbackActionIcon" />
            <span>{{ playbackActionLabel }}</span>
          </button>
          <button
            v-if="playback.state !== 'idle'"
            type="button"
            class="playback-button"
            :aria-label="t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackRestore')"
            @click="emit('restore')"
          >
            <t-icon name="rollback" />
            <span>{{ t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackRestore') }}</span>
          </button>
        </div>
      </section>

      <section class="graph-control-section">
        <button type="button" class="tree-item-self" @click="toggleCollapse('collapse-forces')">
          <t-icon :name="modelValue['collapse-forces'] ? 'chevron-right' : 'chevron-down'" />
          <span>{{ t('knowledgeEditor.wikiBrowser.obsidianGraph.forces') }}</span>
        </button>
        <div v-if="!modelValue['collapse-forces']" class="tree-item-children">
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.center')"
            :value="modelValue.centerStrength"
            :min="0"
            :max="1"
            :step="0.01"
            @change="update('centerStrength', $event)"
          />
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.repel')"
            :value="modelValue.repelStrength"
            :min="0"
            :max="20"
            :step="0.1"
            @change="update('repelStrength', $event)"
          />
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.link')"
            :value="modelValue.linkStrength"
            :min="0"
            :max="1"
            :step="0.01"
            @change="update('linkStrength', $event)"
          />
          <GraphSlider
            :label="t('knowledgeEditor.wikiBrowser.obsidianGraph.linkDistance')"
            :value="modelValue.linkDistance"
            :min="30"
            :max="500"
            :step="1"
            @change="update('linkDistance', $event)"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WikiGraphPlaybackSnapshot } from './wikiGraphRenderer.ts'
import type { ObsidianGraphSettings } from './obsidianGraphSettings.ts'

const GraphSlider = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, required: true },
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('label', { class: 'setting-item' }, [
      h('span', { class: 'setting-item-name' }, props.label),
      h('input', {
        class: 'graph-slider',
        type: 'range',
        min: props.min,
        max: props.max,
        step: props.step,
        value: props.value,
        'aria-label': props.label,
        style: { '--slider-fill-ratio': (props.value - props.min) / (props.max - props.min) },
        onInput: (event: Event) => emit('change', Number((event.target as HTMLInputElement).value)),
      }),
    ])
  },
})

const props = defineProps<{
  modelValue: ObsidianGraphSettings
  playback: WikiGraphPlaybackSnapshot
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: ObsidianGraphSettings): void
  (event: 'reset'): void
  (event: 'play'): void
  (event: 'pause'): void
  (event: 'resume'): void
  (event: 'restore'): void
}>()

const { t } = useI18n()

const playbackActionLabel = computed(() => {
  if (props.playback.state === 'playing') {
    return t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackPause')
  }
  if (props.playback.state === 'paused') {
    return t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackResume')
  }
  if (props.playback.state === 'complete') {
    return t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackReplay')
  }
  return t('knowledgeEditor.wikiBrowser.obsidianGraph.playbackPlay')
})

const playbackActionIcon = computed(() => {
  if (props.playback.state === 'playing') return 'pause-circle'
  if (props.playback.state === 'complete') return 'refresh'
  return 'play-circle'
})

function handlePlaybackAction(): void {
  if (props.playback.state === 'playing') {
    emit('pause')
    return
  }
  if (props.playback.state === 'paused') {
    emit('resume')
    return
  }
  emit('play')
}

function update<K extends keyof ObsidianGraphSettings>(
  key: K,
  value: ObsidianGraphSettings[K],
): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function toggleCollapse(key: 'collapse-display' | 'collapse-forces'): void {
  update(key, !props.modelValue[key])
}
</script>

<style scoped lang="less">
.obsidian-graph-controls-wrap {
  position: static;
  width: 100%;
  color: var(--td-text-color-primary);
  font: var(--td-font-body-small, 12px/20px var(--td-font-family));
}

button {
  font: inherit;
}

.graph-settings-trigger,
.clickable-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--td-text-color-secondary);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.graph-settings-trigger {
  width: 100%;
  min-height: 26px;
  gap: 6px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--td-radius-default, 8px);
  justify-content: flex-start;
  font-size: 11px;
  line-height: 14px;
  text-align: left;
  user-select: none;
}

.graph-settings-trigger:hover,
.clickable-icon:hover {
  color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}

.graph-settings-trigger:focus-visible,
.clickable-icon:focus-visible,
.tree-item-self:focus-visible,
.playback-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--td-brand-color-focus);
}

.graph-controls {
  position: relative;
  width: 236px;
  max-height: min(620px, calc(100vh - 150px));
  overflow: auto;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium, 6px);
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-2);
  scrollbar-width: thin;
}

.graph-controls-actions {
  position: absolute;
  top: 7px;
  right: 8px;
  z-index: 2;
  display: flex;
  gap: 4px;
}

.clickable-icon {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--td-radius-default, 3px);
}

.graph-control-section {
  padding: 7px 12px;
  border-bottom: 1px solid var(--td-component-stroke);
}

.graph-control-section:last-child {
  border-bottom: 0;
}

.tree-item-self {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 28px;
  padding: 0 64px 0 4px;
  border: 0;
  border-radius: var(--td-radius-default, 8px);
  color: var(--td-text-color-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.tree-item-self:hover {
  color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}

.tree-item-self :deep(.t-icon) {
  width: 14px;
  margin-right: 3px;
  color: var(--td-text-color-secondary);
}

.tree-item-self:hover :deep(.t-icon),
.tree-item-self:focus-visible :deep(.t-icon) {
  color: var(--td-brand-color);
}

.tree-item-children {
  padding: 6px 4px 2px;
}

.setting-item {
  display: block;
  padding: 5px 0 9px;
}

.setting-item-name {
  display: block;
  margin-bottom: 7px;
  color: var(--td-text-color-secondary);
}

.graph-slider {
  --slider-fill-position: calc(7px + (100% - 14px) * var(--slider-fill-ratio, 0));
  width: 100%;
  height: 4px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  outline: none;
  appearance: none;
  background-color: var(--td-bg-color-component);
  background-image: linear-gradient(
    to right,
    var(--td-brand-color) var(--slider-fill-position),
    transparent var(--slider-fill-position)
  );
}

.graph-slider::-webkit-slider-runnable-track {
  height: 6px;
  appearance: none;
}

.graph-slider::-webkit-slider-thumb {
  position: relative;
  top: -4px;
  width: 14px;
  height: 14px;
  border: 1px solid var(--td-component-border);
  border-radius: 50%;
  appearance: none;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-1);
  cursor: pointer;
}

.graph-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px var(--td-brand-color-focus);
}

.graph-slider:focus-visible {
  box-shadow: none;
}

.graph-playback-heading,
.graph-playback-title {
  display: inline-flex;
  align-items: center;
}

.graph-playback-heading {
  justify-content: space-between;
  width: 100%;
  min-height: 26px;
}

.graph-playback-title {
  gap: 6px;
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.graph-playback-title :deep(.t-icon) {
  color: var(--td-brand-color);
}

.graph-playback-progress {
  color: var(--td-text-color-placeholder);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.graph-playback-description {
  margin: 3px 0 8px;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.graph-playback-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
}

.playback-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 4px 6px;
  margin: 0 0 2px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default, 8px);
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-container);
  cursor: pointer;
  font-size: 11px;
  line-height: 1.35;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.playback-button :deep(.t-icon) {
  flex-shrink: 0;
}

.playback-button > span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.playback-button:hover:not(:disabled) {
  border-color: var(--td-brand-color);
  color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}

.playback-button:disabled {
  color: var(--td-text-color-disabled);
  background: var(--td-bg-color-secondarycontainer);
  border-color: var(--td-component-stroke);
  cursor: not-allowed;
}

.legend-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
  font-size: 13px;
  line-height: 1;
  transition: color 0.15s ease;
}

.legend-action-icon :deep(.t-icon) {
  font-size: 13px;
  line-height: 1;
}

.graph-settings-trigger:hover .legend-action-icon,
.graph-settings-trigger:focus-visible .legend-action-icon {
  color: var(--td-brand-color);
}
</style>
