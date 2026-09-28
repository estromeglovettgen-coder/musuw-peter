<template>
  <section class="visual-general-settings">
    <header class="visual-settings-page-header visual-general-settings__header">
      <div class="visual-settings-page-header__copy">
        <h2 class="visual-settings-page-header__title">{{ $t('general.title') }}</h2>
        <p class="visual-settings-page-header__description">{{ $t('general.description') }}</p>
      </div>
    </header>

    <div class="visual-setting-list">
      <div class="visual-setting-row">
        <div class="visual-setting-row__copy">
          <label for="visual-language-select">{{ $t('language.language') }}</label>
          <p>{{ $t('language.languageDescription') }}</p>
        </div>
        <div class="visual-setting-row__control">
          <div ref="preferenceSelectRoot" class="visual-general-settings__select">
            <button
              id="visual-language-select"
              type="button"
              class="visual-general-settings__select-control"
              :aria-expanded="openPreferenceSelect === 'language'"
              aria-haspopup="listbox"
              @click.stop="togglePreferenceSelect('language')"
            >
              <span class="visual-general-settings__select-value">{{ languageLabel }}</span>
              <t-icon name="chevron-down" aria-hidden="true" />
            </button>
            <Transition name="visual-general-settings__select-fade">
              <div v-if="openPreferenceSelect === 'language'" class="visual-general-settings__select-dropdown" role="listbox" :aria-label="$t('language.selectLanguage')">
                <button
                  v-for="option in languageOptions"
                  :key="option.value"
                  type="button"
                  role="option"
                  class="visual-general-settings__select-option"
                  :class="{ 'is-selected': option.value === localLanguage }"
                  :aria-selected="option.value === localLanguage"
                  @click="handlePreferenceSelect('language', option.value)"
                >
                  <span>{{ option.label }}</span>
                  <t-icon v-if="option.value === localLanguage" class="visual-general-settings__select-check" name="check" aria-hidden="true" />
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <div class="visual-setting-row">
        <div class="visual-setting-row__copy">
          <label for="visual-theme-select">{{ $t('theme.theme') }}</label>
          <p>{{ $t('theme.themeDescription') }}</p>
        </div>
        <div class="visual-setting-row__control">
          <div class="visual-general-settings__select">
            <button
              id="visual-theme-select"
              type="button"
              class="visual-general-settings__select-control"
              :aria-expanded="openPreferenceSelect === 'theme'"
              aria-haspopup="listbox"
              @click.stop="togglePreferenceSelect('theme')"
            >
              <span class="visual-general-settings__select-value">{{ themeLabel }}</span>
              <t-icon name="chevron-down" aria-hidden="true" />
            </button>
            <Transition name="visual-general-settings__select-fade">
              <div v-if="openPreferenceSelect === 'theme'" class="visual-general-settings__select-dropdown" role="listbox" :aria-label="$t('theme.selectTheme')">
                <button
                  v-for="option in themeOptions"
                  :key="option.value"
                  type="button"
                  role="option"
                  class="visual-general-settings__select-option"
                  :class="{ 'is-selected': option.value === localTheme }"
                  :aria-selected="option.value === localTheme"
                  @click="handlePreferenceSelect('theme', option.value)"
                >
                  <span>{{ option.label }}</span>
                  <t-icon v-if="option.value === localTheme" class="visual-general-settings__select-check" name="check" aria-hidden="true" />
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <div v-if="false" class="visual-setting-row" data-persisted-setting="theme-color">
        <div class="visual-setting-row__copy">
          <label for="visual-theme-color-select">{{ $t('theme.color') }}</label>
          <p>{{ $t('theme.colorDescription') }}</p>
        </div>
        <div class="visual-setting-row__control">
          <div class="visual-general-settings__select">
            <button
              id="visual-theme-color-select"
              type="button"
              class="visual-general-settings__select-control"
              :aria-expanded="openPreferenceSelect === 'themeColor'"
              aria-haspopup="listbox"
              @click.stop="togglePreferenceSelect('themeColor')"
            >
              <span class="visual-general-settings__select-value">{{ themeColorLabel }}</span>
              <t-icon name="chevron-down" aria-hidden="true" />
            </button>
            <Transition name="visual-general-settings__select-fade">
              <div v-if="openPreferenceSelect === 'themeColor'" class="visual-general-settings__select-dropdown" role="listbox" :aria-label="$t('theme.selectColor')">
                <button
                  v-for="option in themeColorOptions"
                  :key="option.value"
                  type="button"
                  role="option"
                  class="visual-general-settings__select-option"
                  :class="{ 'is-selected': option.value === localThemeColor }"
                  :aria-selected="option.value === localThemeColor"
                  @click="handlePreferenceSelect('themeColor', option.value)"
                >
                  <span>{{ option.label }}</span>
                  <t-icon v-if="option.value === localThemeColor" class="visual-general-settings__select-check" name="check" aria-hidden="true" />
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <div v-if="!authStore.isLiteMode" class="visual-setting-row">
        <div class="visual-setting-row__copy">
          <label for="visual-sans-font-select">{{ $t('font.uiFont') }}</label>
          <p>{{ $t('font.uiFontDescription') }}</p>
        </div>
        <div class="visual-setting-row__control is-stacked">
          <t-select
            id="visual-sans-font-select"
            class="visual-scene-select"
            v-model="localSansFont"
            :placeholder="$t('font.selectFont')"
            @change="handleSansFontChange"
          >
            <t-option
              v-for="opt in sansFontOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            >
              <span :style="{ fontFamily: opt.preview }">{{ opt.label }}</span>
            </t-option>
          </t-select>
          <span class="visual-font-preview" :style="{ fontFamily: currentSansStack }">{{ $t('font.sansPreview') }}</span>
        </div>
      </div>

      <div v-if="!authStore.isLiteMode" class="visual-setting-row">
        <div class="visual-setting-row__copy">
          <label for="visual-mono-font-select">{{ $t('font.monoFont') }}</label>
          <p>{{ $t('font.monoFontDescription') }}</p>
        </div>
        <div class="visual-setting-row__control is-stacked">
          <t-select
            id="visual-mono-font-select"
            class="visual-scene-select"
            v-model="localMonoFont"
            :placeholder="$t('font.selectFont')"
            @change="handleMonoFontChange"
          >
            <t-option
              v-for="opt in monoFontOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            >
              <span :style="{ fontFamily: opt.preview }">{{ opt.label }}</span>
            </t-option>
          </t-select>
          <span class="visual-font-preview" :style="{ fontFamily: currentMonoStack }">{{ $t('font.monoPreview') }}</span>
        </div>
      </div>

      <div v-if="!authStore.isLiteMode" class="visual-setting-row">
        <div class="visual-setting-row__copy">
          <label>{{ $t('font.fontSize') }}</label>
          <p>{{ $t('font.fontSizeDescription') }}</p>
        </div>
        <div class="visual-setting-row__control">
          <t-radio-group v-model="localFontSize" @change="handleFontSizeChange">
            <t-radio-button value="small">{{ $t('font.size.small') }}</t-radio-button>
            <t-radio-button value="normal">{{ $t('font.size.normal') }}</t-radio-button>
            <t-radio-button value="large">{{ $t('font.size.large') }}</t-radio-button>
          </t-radio-group>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { normalizeLocale, persistLocalePreference } from '@/i18n/locale'
import { useTheme, type ThemeColor, type ThemeMode } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import {
  useFont,
  SANS_STACKS,
  MONO_STACKS,
  visibleSansKeys,
  visibleMonoKeys,
  type FontKey,
  type MonoFontKey,
  type FontSizeKey,
} from '@/composables/useFont'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const { currentTheme, currentThemeColor, setTheme, setThemeColor } = useTheme()
const {
  currentSans,
  currentMono,
  currentSize,
  setSansFont,
  setMonoFont,
  setFontSize,
} = useFont()

const localLanguage = ref(locale.value)
const localTheme = ref<ThemeMode>(currentTheme.value)
const localThemeColor = ref<ThemeColor>(currentThemeColor.value)
const localSansFont = ref<FontKey>(currentSans.value)
const localMonoFont = ref<MonoFontKey>(currentMono.value)
const localFontSize = ref<FontSizeKey>(currentSize.value)
type PreferenceSelect = 'language' | 'theme' | 'themeColor'
const openPreferenceSelect = ref<PreferenceSelect | null>(null)
const preferenceSelectRoot = ref<HTMLElement | null>(null)

watch(currentTheme, (value) => { localTheme.value = value })
watch(currentThemeColor, (value) => { localThemeColor.value = value })
watch(currentSans, (value) => { localSansFont.value = value })
watch(currentMono, (value) => { localMonoFont.value = value })
watch(currentSize, (value) => { localFontSize.value = value })

const sansFontOptions = computed<{ value: FontKey; label: string; preview: string }[]>(() =>
  visibleSansKeys().map((key) => ({
    value: key,
    label: t(`font.sans.${key}`),
    preview: SANS_STACKS[key],
  })),
)

const monoFontOptions = computed<{ value: MonoFontKey; label: string; preview: string }[]>(() =>
  visibleMonoKeys().map((key) => ({
    value: key,
    label: t(`font.mono.${key}`),
    preview: MONO_STACKS[key],
  })),
)

const currentSansStack = computed(() => SANS_STACKS[localSansFont.value] ?? SANS_STACKS.system)
const currentMonoStack = computed(() => MONO_STACKS[localMonoFont.value] ?? MONO_STACKS.system)
const languageOptions = computed(() => [
  { value: 'zh-CN', label: t('language.zhCN') },
  { value: 'en-US', label: t('language.enUS') },
  { value: 'ru-RU', label: t('language.ruRU') },
  { value: 'ko-KR', label: t('language.koKR') },
] as const)
const themeOptions = computed(() => [
  { value: 'light' as const, label: t('theme.light') },
  { value: 'dark' as const, label: t('theme.dark') },
  { value: 'system' as const, label: t('theme.system') },
])
const themeColorOptions = computed(() => [
  { value: 'musuw' as const, label: t('theme.musuw') },
  { value: 'weknora' as const, label: t('theme.weknora') },
])
const languageLabel = computed(() => languageOptions.value.find(option => option.value === localLanguage.value)?.label || t('language.selectLanguage'))
const themeLabel = computed(() => themeOptions.value.find(option => option.value === localTheme.value)?.label || t('theme.selectTheme'))
const themeColorLabel = computed(() => themeColorOptions.value.find(option => option.value === localThemeColor.value)?.label || t('theme.selectColor'))

onMounted(() => {
  let savedLocale: string | null = null
  try {
    savedLocale = localStorage.getItem('locale')
  } catch {
    savedLocale = null
  }
  const normalized = normalizeLocale(savedLocale)
  localLanguage.value = normalized || locale.value
  if (normalized) locale.value = normalized
  document.addEventListener('click', handlePreferenceOutsideClick)
})

onUnmounted(() => document.removeEventListener('click', handlePreferenceOutsideClick))

const togglePreferenceSelect = (key: PreferenceSelect) => {
  openPreferenceSelect.value = openPreferenceSelect.value === key ? null : key
}

const handlePreferenceOutsideClick = (event: MouseEvent) => {
  if (!preferenceSelectRoot.value?.contains(event.target as Node)) openPreferenceSelect.value = null
}

const handlePreferenceSelect = (key: PreferenceSelect, value: string) => {
  openPreferenceSelect.value = null
  if (key === 'language') {
    localLanguage.value = value
    handleLanguageChange()
  } else if (key === 'theme') {
    handleThemeChange(value as ThemeMode)
  } else {
    handleThemeColorChange(value as ThemeColor)
  }
}

const handleLanguageChange = () => {
  const persisted = persistLocalePreference(localLanguage.value)
  if (!persisted) {
    localLanguage.value = locale.value
    return
  }
  locale.value = persisted
  MessagePlugin.success(t('language.languageSaved'))
}

const handleThemeChange = (value: ThemeMode) => {
  if (!setTheme(value)) {
    localTheme.value = currentTheme.value
    return
  }
  MessagePlugin.success(t('common.success'))
}

const handleThemeColorChange = (value: ThemeColor) => {
  if (!setThemeColor(value)) {
    localThemeColor.value = currentThemeColor.value
    return
  }
  MessagePlugin.success(t('common.success'))
}

const handleSansFontChange = (value: FontKey) => {
  if (!setSansFont(value)) {
    localSansFont.value = currentSans.value
    return
  }
  MessagePlugin.success(t('common.success'))
}

const handleMonoFontChange = (value: MonoFontKey) => {
  if (!setMonoFont(value)) {
    localMonoFont.value = currentMono.value
    return
  }
  MessagePlugin.success(t('common.success'))
}

const handleFontSizeChange = (value: FontSizeKey) => {
  if (!setFontSize(value)) {
    localFontSize.value = currentSize.value
    return
  }
  MessagePlugin.success(t('common.success'))
}
</script>

<style scoped lang="less">
.visual-general-settings {
  width: 100%;
  max-width: none;
  min-width: 0;
  box-sizing: border-box;
  color: #1f2937;
}

.visual-general-settings__header {
  margin: 0 0 8px;
  padding: 0 0 12px;
  border-bottom: 1px solid #f3f4f6;
}
.visual-general-settings__header h2 {
  margin: 0;
  color: #111827;
  font-size: 16px;
  line-height: 24px;
  font-weight: 700;
}
.visual-general-settings__header p {
  margin: 2px 0 0;
  color: #9ca3af;
  font-size: 12px;
  line-height: 16px;
}

.visual-setting-list {
  width: 100%;
  min-width: 0;
  /* Dropdown menus are rendered inside this list; keep their popup surface
   * visible instead of clipping it at the row container. */
  overflow: visible;
  border: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.visual-setting-row {
  width: 100%;
  min-width: 0;
  min-height: 64px;
  margin: 0;
  padding: 14px 0;
  box-sizing: border-box;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.visual-setting-row:last-child { border-bottom: 0; }

.visual-setting-row__copy { min-width: 0; }
.visual-setting-row__copy label {
  display: block;
  margin: 0;
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
.visual-setting-row__copy p {
  margin: 2px 0 0;
  color: #777;
  font-size: 12px;
  line-height: 18px;
}

.visual-setting-row__control {
  width: min(280px, 100%);
  min-width: 0;
  flex: 0 0 auto;
}
.visual-general-settings__select {
  position: relative;
  width: min(280px, 100%);
  min-width: min(210px, 100%);
  user-select: none;
}
.visual-general-settings__select-control {
  width: 100%;
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  background: #fff;
  color: #9ca3af;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  text-align: left;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  cursor: pointer;
  transition: all 150ms ease;
}
.visual-general-settings__select-control:hover,
.visual-general-settings__select-control:focus-visible {
  outline: none;
  border-color: #d1d5db;
  background: #fff;
}
.visual-general-settings__select-control[aria-expanded='true'] { color: #1f2937; }
.visual-general-settings__select-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #1f2937; }
.visual-general-settings__select-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 288px;
  max-width: min(288px, calc(100vw - 32px));
  max-height: 256px;
  overflow-y: auto;
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.visual-general-settings__select-option {
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
}
.visual-general-settings__select-option:hover,
.visual-general-settings__select-option:focus-visible { outline: none; background: #f9fafb; }
.visual-general-settings__select-option.is-selected { background: #f3f4f6; color: #111827; font-weight: 600; }
.visual-general-settings__select-fade-enter-active,
.visual-general-settings__select-fade-leave-active { transition: opacity 100ms ease, transform 100ms ease; transform-origin: top right; }
.visual-general-settings__select-fade-enter-from,
.visual-general-settings__select-fade-leave-to { opacity: 0; transform: scale(.95); }
.visual-setting-row__control.is-stacked { display: flex; flex-direction: column; gap: 6px; }
.visual-setting-row__control.is-switch { display: flex; justify-content: flex-end; }
.visual-setting-row__control :deep(.t-select) { width: 100%; }
.visual-setting-row__control :deep(.t-input) {
  min-height: 34px;
  border-color: #e5e7eb;
  border-radius: 12px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 2%);
}
.visual-setting-row__control :deep(.t-input:hover) { border-color: #d1d5db; }
.visual-setting-row__control :deep(.t-radio-group) { width: 100%; display: flex; }
.visual-setting-row__control :deep(.t-radio-button) {
  min-width: 0;
  flex: 1 1 0;
  height: 32px;
  padding: 0 8px;
  border-color: #e5e7eb;
  background: #fff;
  color: #6b7280;
  font-size: 10px;
}
.visual-setting-row__control :deep(.t-radio-button.t-is-checked) {
  border-color: #111827;
  background: #111827;
  color: #fff;
}
.visual-setting-row__control :deep(.t-switch.t-is-checked) { background: #111827; }

.visual-font-preview {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #9ca3af;
  font-size: 9px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .visual-setting-row { align-items: flex-start; flex-direction: column; gap: 16px; }
  .visual-setting-row__control { width: min(280px, 100%); min-width: 0; }
}
@media (min-width: 640px) {
  .visual-general-settings__select-control,
  .visual-general-settings__select-option { font-size: 14px; }
}
@media (max-width: 520px) {
  .visual-general-settings__header { padding-right: 0; }
}
</style>
