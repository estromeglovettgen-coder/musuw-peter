import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const pageFiles = [
  'GeneralSettings.vue',
  'UsageBillingSettings.vue',
  'ModelSettings.vue',
  'UserProfile.vue',
  'McpSettings.vue',
]

const readPage = (file) => readFileSync(join(root, 'src/views/settings', file), 'utf8')

test('all five Lite settings pages share the authoritative title-strip DOM contract', () => {
  for (const file of pageFiles) {
    const source = readPage(file)
    assert.match(source, /<(?:header|div) class="[^"]*visual-settings-page-header[^"]*">/)
    assert.match(source, /class="visual-settings-page-header__copy"/)
    assert.match(source, /<h2 class="visual-settings-page-header__title">/)
    if (file === 'UserProfile.vue' || file === 'UsageBillingSettings.vue') {
      assert.doesNotMatch(source, /<p class="visual-settings-page-header__description[^"]*">/)
    } else {
      assert.match(source, /<p class="visual-settings-page-header__description[^"]*">/)
    }
  }

  for (const file of ['UserProfile.vue', 'McpSettings.vue']) {
    const source = readPage(file)
    assert.doesNotMatch(source, /class="visual-settings-page-header section-header"/)
    assert.doesNotMatch(source, /class="visual-settings-page-header__description section-description"/)
  }
})

test('consumer-only presentation hides brand color and shows the existing scene model rows', () => {
  const general = readPage('GeneralSettings.vue')
  assert.match(general, /<div\s+v-if="false"\s+class="visual-setting-row"\s+data-persisted-setting="theme-color">/)
  assert.match(general, /localThemeColor/)
  assert.match(general, /handleThemeColorChange/)

  const models = readPage('ModelSettings.vue')
  assert.match(models, /<section\s+v-if="authStore\.isLiteMode"\s+class="consumer-scene-settings"\s+data-persisted-capability="consumer-scene-models"/)
  assert.match(models, /getConsumerSceneModel/)
  assert.match(models, /updateConsumerSceneModel/)
})

test('the shared title strip keeps the reference cadence and borders', () => {
  const shell = readFileSync(join(root, 'src/views/settings/components/VisualSettingsShell.vue'), 'utf8')
  const titleRule = shell.match(/\.visual-settings-content \.visual-settings-page-header,\s*\.visual-settings-content \.section-header\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(titleRule, /margin:\s*0 0 8px !important/)
  assert.match(titleRule, /padding:\s*0 0 12px !important/)
  assert.match(titleRule, /border-bottom:\s*1px solid #f3f4f6 !important/)
  assert.match(shell, /\.visual-settings-content \.visual-settings-page-header__title,\s*\.visual-settings-content \.section-header h2\s*\{[\s\S]*font-size:\s*16px !important;[\s\S]*line-height:\s*24px !important;/)
  assert.match(shell, /\.visual-settings-content \.visual-settings-page-header__description,\s*\.visual-settings-content \.section-description\s*\{[\s\S]*font-size:\s*12px !important;[\s\S]*line-height:\s*16px !important;/)
  assert.match(shell, /:root\[theme-mode="dark"\] \.visual-settings-content \.visual-settings-page-header,\s*:root\[theme-mode="dark"\] \.visual-settings-content \.section-header\s*\{[\s\S]*border-bottom-color:\s*#27272a/)
  assert.match(shell, /:root\[theme-mode="dark"\] \.visual-settings-content h2\.visual-settings-page-header__title,\s*:root\[theme-mode="dark"\] \.visual-settings-content \.section-header h2\s*\{[\s\S]*color:\s*#fff !important/)
})

test('usage title is mounted before the authoritative plan row and models title is not Lite-gated', () => {
  const usage = readPage('UsageBillingSettings.vue')
  assert.ok(usage.indexOf('visual-settings-page-header__title') < usage.indexOf('usage-billing__quota-title'))

  const models = readPage('ModelSettings.vue')
  const headerStart = models.indexOf('<header class="visual-settings-page-header')
  const firstHeaderClose = models.indexOf('</header>', headerStart)
  assert.ok(headerStart >= 0 && firstHeaderClose > headerStart)
  assert.ok(!models.slice(0, headerStart).includes('v-if="!authStore.isLiteMode"'))
})

test('the rag boundary is presented as the agent model in every shipped locale', () => {
  const localeFiles = ['zh-CN.ts', 'en-US.ts', 'ko-KR.ts', 'ru-RU.ts']
  const expectedLabels = ['智能体模型', 'Agent model', '에이전트 모델', 'Модель агента']
  for (const [index, file] of localeFiles.entries()) {
    const source = readFileSync(join(root, 'src/i18n/locales', file), 'utf8')
    assert.match(source, new RegExp(`rag: \\{ label: '${expectedLabels[index]}'`))
  }
})
