import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const finalTheme = read('./musuw-final-theme-closure.css')

test('settings shell follows the supplied SettingsModal geometry', () => {
  const source = read('../views/settings/components/VisualSettingsShell.vue')
  assert.match(source, /width: min\(896px, 100%\);/)
  assert.match(source, /@media \(min-width: 1024px\)\s*\{[\s\S]*?\.visual-settings-modal \{ width: min\(1024px, 100%\); \}/)
  assert.match(source, /height: 620px;/)
  assert.match(source, /max-height: 92vh;/)
  assert.match(source, /border-radius: 24px;/)
  assert.match(source, /flex: 0 0 192px;/)
  assert.match(source, /padding: 16px 12px 12px;/)
  assert.match(source, /background: rgb\(0 0 0 \/ 50%\);/)
  assert.match(source, /backdrop-filter: blur\(4px\);/)
  assert.match(source, /padding: 12px;/)
  assert.match(source, /@media \(min-width: 640px\)\s*\{[\s\S]*\.visual-settings-overlay \{ padding: 16px; \}/)
  assert.match(source, /box-shadow: 0 25px 50px -12px rgb\(0 0 0 \/ 25%\);/)
  assert.match(source, /:root\[theme-mode="dark"\] \.visual-settings-modal,[\s\S]*?background: #18181b;/)
  assert.match(source, /:root\[theme-mode="dark"\] \.visual-settings-sidebar\s*\{[^}]*background: rgb\(9 9 11 \/ 60%\);/)
  assert.doesNotMatch(source, /background: #202124|background: #292a2d/)
})

test('settings shell exposes only source tabs plus a close circle in every mode', () => {
  const shell = read('../views/settings/components/VisualSettingsShell.vue')
  const settings = read('../views/settings/Settings.vue')
  assert.match(shell, /<button[^>]*class="visual-settings-close"[^>]*@click="emit\('close'\)"/)
  assert.match(shell, /class="visual-settings-overlay"[^>]*@click\.self="emit\('close'\)"/)
  assert.match(shell, /class="visual-settings-close"[^>]*:title="\$t\('general\.close'\)"/)
  assert.doesNotMatch(shell, /visual-settings-fade/)
  for (const legacy of ['visual-settings-back', 'visual-settings-search', 'visual-settings-title', 'visual-settings-nav__group']) {
    assert.equal(shell.includes(legacy), false, `${legacy} is not in SettingsModal source`)
  }
  assert.match(settings, /\{ key: 'general',[\s\S]*\{ key: 'userprofile',[\s\S]*\{ key: 'models',[\s\S]*\{ key: 'mymemory',[\s\S]*\{ key: 'memory',[\s\S]*\{ key: 'mcp',[\s\S]*\{ key: 'usage'/)
  assert.equal((settings.match(/key: 'system-audit-log'/g) || []).length, 1)
})

test('settings navigation is the source plain-text stack and close button uses the source transition', () => {
  const settings = read('../views/settings/Settings.vue')
  const shell = read('../views/settings/components/VisualSettingsShell.vue')
  const navSlot = settings.match(/<template #nav>[\s\S]*?<\/template>/)?.[0] || ''
  assert.doesNotMatch(navSlot, /t-icon|visual-settings-nav__emoji|emoji/)
  assert.match(navSlot, /<span>\{\{ item\.label \}\}<\/span>/)
  assert.match(shell, /\.visual-settings-close\s*\{[\s\S]*transition: all 150ms ease;/)
})

test('left avatar menu keeps the reference profile and divider treatment', () => {
  const source = read('../components/UserMenu.vue')
  assert.match(source, /class="visual-user-menu__divider visual-user-menu__divider--dashed"/)
  assert.match(source, /\.visual-user-menu__avatar\.is-small[\s\S]*background: #000;/)
  assert.match(source, /\.visual-user-menu__dropdown[\s\S]*padding: 6px;/)
  assert.match(source, /\.visual-user-menu__dropdown[\s\S]*gap: 2px;/)
  assert.match(source, /\.visual-user-menu__account[\s\S]*min-height: 40px;[\s\S]*box-sizing: border-box;[\s\S]*padding: 8px 12px;/)
  assert.match(source, /\.visual-user-menu__account[\s\S]*background: transparent;/)
  assert.match(source, /\.visual-user-menu__account-copy strong[\s\S]*font-weight: 500;/)
  assert.match(source, /\.visual-user-menu__divider\s*\{[\s\S]*margin: 4px;/)
  assert.match(source, /\.visual-user-menu\.is-collapsed \.visual-user-menu__avatar\s*\{[\s\S]*width: 32px;[\s\S]*height: 32px;/)
  assert.match(source, /\.visual-user-menu__item[\s\S]*min-height: 40px;[\s\S]*box-sizing: border-box;[\s\S]*padding: 8px 12px;/)
  assert.match(source, /\.visual-user-menu__item[\s\S]*border-radius: 12px;/)
  assert.match(source, /visual-user-menu__divider visual-user-menu__divider--dashed[\s\S]*visual-user-menu__usage-item[\s\S]*visual-user-menu__billing-item[\s\S]*handleQuickNav\('general'\)[\s\S]*handleLogout/)
  assert.doesNotMatch(source, /visual-user-menu__account-copy[^\n]*<small>/)
  assert.match(source, /const handleTriggerClick = \(\) => \{[\s\S]*uiStore\.expandSidebar\(\)[\s\S]*menuVisible\.value = false/)
  assert.match(source, /@click="handleTriggerClick"/)
  assert.match(source, /userAvatar && !authStore\.isLiteMode/)
  assert.doesNotMatch(source, /visual-user-menu-pop/)
  assert.match(source, /v-if="billingIsFree"[\s\S]*name="arrow-up"[\s\S]*v-else[\s\S]*name="crown"/)
  assert.match(source, /const billingIsFree = computed\(/)
})

test('consumer model settings hide legacy catalog management in Lite mode', () => {
  const source = read('../views/settings/ModelSettings.vue')
  assert.match(source, /<template v-if="!authStore\.isLiteMode">[\s\S]*visual-model-tabs[\s\S]*visual-model-settings__content[\s\S]*<\/template>/)
  assert.match(source, /consumer-scene-settings/)
})

test('consumer model scene controls use the reference vertical row stack', () => {
  const source = read('../views/settings/ModelSettings.vue')
  const grid = source.match(/\.consumer-scene-settings__grid\s*\{([^}]*)\}/)?.[1] || ''
  const row = source.match(/\.consumer-scene-settings__row\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(grid, /display: flex;/)
  assert.match(grid, /flex-direction: column;/)
  assert.match(row, /display: flex;/)
  assert.match(row, /border-bottom: 1px solid/)
})

test('usage and general settings retain the authoritative unboxed row scale', () => {
  const usage = read('../views/settings/UsageBillingSettings.vue')
  const general = read('../views/settings/GeneralSettings.vue')
  assert.doesNotMatch(usage, /usage-billing__header|usage-billing__group|usage-billing__section|usage-billing__card/)
  assert.match(usage, /usage-billing__rows/)
  assert.match(usage, /\.usage-billing__meter\s*\{[\s\S]*width: 100%;[\s\S]*height: 6px;/)
  assert.match(usage, /\.usage-billing__meter-control\s*\{[\s\S]*width:\s*224px;/)
  assert.doesNotMatch(usage, /usage-billing__primary/)
  assert.match(usage, /usage-billing__meter-meta[\s\S]*entitlement\.remaining[\s\S]*usage-billing__meter/)
  assert.match(usage, /usage-billing__row usage-billing__row--meter/)
  assert.match(usage, /entitlement\.storageUsage/)
  assert.match(usage, /\.usage-billing__row\s*\{[\s\S]*padding: 14px 0;[\s\S]*border-bottom: 1px solid #f3f4f6;/)
  assert.match(usage, /v-if="!authStore\.isLiteMode" class="usage-billing__row is-compact"/)
  assert.match(usage, /createPaddlePortalSession/)
  assert.match(usage, /handlePortal/)
  assert.match(usage, /portalOpening/)
  assert.match(usage, /portalAvailable/)
  assert.match(usage, /\.usage-billing\s*\{[\s\S]*animation: usage-billing-fade 150ms ease-out;/)
  assert.match(usage, /\.usage-billing__plan-name\s*\{[\s\S]*font-size: 14px;[\s\S]*line-height: 20px;[\s\S]*font-weight: 500;/)
  assert.match(usage, /\.usage-billing__quota-title\s*\{[\s\S]*font-size: 12px;[\s\S]*line-height: 16px;[\s\S]*font-weight: 600;/)
  assert.match(usage, /\.usage-billing__meter-meta > strong\s*\{[\s\S]*color: #111827;[\s\S]*font-family: var\(--app-font-family-mono\);[\s\S]*font-size: 12px;[\s\S]*font-weight: 700;/)
  assert.match(usage, /\.usage-billing__storage-usage\s*\{[\s\S]*color: #6b7280;/)
  assert.match(usage, /Math\.max\(4, storageRemainingPercent\)/)
  assert.match(usage, /\.usage-billing__secondary\s*\{[\s\S]*background: #fff;[\s\S]*box-shadow: 0 1px 2px rgb\(0 0 0 \/ 5%\);/)
  assert.match(general, /\.visual-setting-list\s*\{[\s\S]*border-radius: 0;/)
  assert.match(general, /\.visual-setting-row\s*\{[\s\S]*padding: 14px 0;[\s\S]*border-bottom: 1px solid #f3f4f6;/)
  assert.match(general, /\.visual-setting-row__copy label\s*\{[\s\S]*font-size: 14px;/)
  assert.match(general, /\.visual-general-settings__header\s*\{[\s\S]*margin: 0 0 8px;/)
  assert.match(general, /\.visual-general-settings__header p\s*\{[\s\S]*color: #9ca3af;[\s\S]*font-size: 12px;[\s\S]*line-height: 16px;/)
  const consumerGeneral = general.split('<div v-if="!authStore.isLiteMode"')[0]
  assert.doesNotMatch(consumerGeneral, /id="visual-language-select"[\s\S]*<t-select|id="visual-theme-select"[\s\S]*<t-select|id="visual-theme-color-select"[\s\S]*<t-select/)
  assert.match(general, /visual-general-settings__select-control/)
  assert.match(general, /id="visual-sans-font-select"[\s\S]*<t-select/)
})

test('consumer scene loading and errors stay on the source CustomSelect branch', () => {
  const source = read('../components/ModelSelector.vue')
  assert.match(source, /const isConsumerSceneSelector = computed\(\(\) =>\s*props\.mode === 'catalog' && \(!props\.showAddModel \|\| props\.useConsumerStyle\),?\s*\)/)
  assert.match(source, /<div v-else-if="isConsumerSceneSelector"[\s\S]*visual-model-selector__consumer-dropdown/)
  assert.match(source, /v-if="loading" class="visual-model-selector__consumer-state"/)
  assert.match(source, /v-else-if="status === 'error'" class="visual-model-selector__consumer-state"/)
  assert.doesNotMatch(source, /isConsumerSceneSelector = computed\(\(\) => props\.mode === 'catalog' && props\.sceneOptions\.length > 0/)
  assert.match(source, /<Transition name="visual-model-selector__consumer-fade">/)
  assert.match(source, /\.visual-model-selector__consumer-control\s*\{[\s\S]*transition: all 150ms ease;/)
  assert.match(source, /\.visual-model-selector__consumer-option\s*\{[\s\S]*transition: background-color 150ms ease, color 150ms ease;/)
})

test('user profile keeps the authoritative unboxed rows and mono account metadata', () => {
  const source = read('../views/settings/UserProfile.vue')
  assert.match(source, /class="visual-settings-page-header"/)
  assert.match(source, /class="user-profile__rows"/)
  // Main adds an inline password-edit affordance; keep the Musuw row
  // geometry while allowing that native control and its explanatory copy.
  assert.doesNotMatch(source, /visual-settings-nav/)
  assert.match(source, /class="edit-btn"/)
  assert.match(source, /class="desc"/)
  assert.match(source, /class="info-value is-mono">\{\{ userInfo\?\.email/)
  assert.match(source, /class="info-value is-mono">\{\{ formatDate/)
  assert.match(source, /\.user-profile__row\s*\{[\s\S]*padding:\s*14px 0;[\s\S]*gap:\s*16px;[\s\S]*border-bottom:\s*1px solid #f3f4f6;/)
  assert.match(source, /\.user-profile\s*\{[\s\S]*max-width:\s*none;/)
  assert.match(source, /\.info-value\.is-mono\s*\{[\s\S]*font-family:\s*var\(--app-font-family-mono\);/)
})

test('the final dark theme owns the current user profile classes, not only legacy settings rows', () => {
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.visual-settings-content h2\.visual-settings-page-header__title\s*\{[^}]*color:\s*#fff\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.visual-settings-content \.user-profile__row\s*\{[^}]*border-bottom-color:\s*#27272a\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.visual-settings-content \.user-profile__label\s*\{[^}]*color:\s*#f4f4f5\s*!important;[^}]*font-size:\s*14px\s*!important;[^}]*line-height:\s*20px\s*!important;[^}]*font-weight:\s*600\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.visual-settings-content \.user-profile \.info-value\s*\{[^}]*color:\s*#e4e4e7\s*!important;[^}]*font-size:\s*14px\s*!important;[^}]*line-height:\s*20px\s*!important;[^}]*font-weight:\s*500\s*!important;/,
  )
})

test('consumer scene dropdown inherits the source CustomSelect tokens', () => {
  const source = read('../components/ModelSelector.vue')
  assert.match(source, /\.visual-model-selector__control[\s\S]*border-radius: 12px;/)
  assert.match(source, /\.visual-model-selector__control[\s\S]*padding: 8px 14px;/)
  assert.match(source, /\.visual-model-selector__control[\s\S]*box-shadow: 0 1px 2px rgb\(0 0 0 \/ 5%\);/)
  assert.match(source, /\.visual-model-selector__option[\s\S]*padding: 8px 12px;/)
  assert.match(source, /\.visual-model-selector__option[\s\S]*border-radius: 12px;/)
})

test('settings and menu controls use the locked Lucide precision masks', () => {
  const source = read('./musuw-reference-lucide-precision.css')
  for (const token of [
    '--mvp-gauge:', '--mvp-sparkles:', '--mvp-crown:', '--mvp-x:', '--mvp-chevron-down:', '--mvp-check:', '--mvp-lock:',
    '.visual-user-menu__item:has(.t-icon-chart-line)::before',
    '.visual-user-menu__item:has(.t-icon-arrow-up)::before',
    '.visual-user-menu__item:has(.t-icon-crown)::before',
    '.visual-settings-close::before',
    '.visual-model-selector__consumer-control::after',
    '.visual-model-selector__consumer-control[aria-expanded="true"]::after',
    '.visual-model-selector__consumer-check::before',
    '.visual-model-selector__consumer-lock::before',
    'transition: transform 150ms ease',
    'stroke-width%3D%222.5%22',
  ]) assert.ok(source.includes(token), `Lucide precision token lost ${token}`)
})
