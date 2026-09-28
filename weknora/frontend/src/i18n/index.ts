import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.ts'
import ruRU from './locales/ru-RU.ts'
import enUS from './locales/en-US.ts'
import koKR from './locales/ko-KR.ts'
import { resolveInitialLocale } from './locale'
import { BUILT_IN_DEFAULT, resolveDefaultLocale } from './resolveDefaultLocale.ts'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ru-RU': ruRU,
  'ko-KR': koKR
}

// Existing preference wins. A deployment-provided default is used when no
// preference exists, followed by Musuw's storefront/browser signals. All
// browser reads are guarded by the resolver so blocked storage is harmless.
const runtimeDefault = typeof window === 'undefined' ? undefined : window.__RUNTIME_CONFIG__?.DEFAULT_LOCALE
// Vite injects `import.meta.env` in the browser build; the same module is also
// imported by Node-based contract tests where that property does not exist.
const buildDefault = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>
}).env?.VITE_DEFAULT_LOCALE
const deploymentDefault = runtimeDefault || buildDefault
const initialLocale = resolveInitialLocale({
  signal: deploymentDefault
    ? resolveDefaultLocale(runtimeDefault, buildDefault)
    : undefined,
})

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: BUILT_IN_DEFAULT,
  globalInjection: true,
  // Some translations intentionally embed `<strong>` markup (e.g. agent step summaries).
  // We render them via v-html with our own sanitization, so silence vue-i18n's HTML warning
  // to avoid flooding the console and slowing renders during history loads.
  warnHtmlMessage: false,
  messages
})

export default i18n
