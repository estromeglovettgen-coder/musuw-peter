import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.ts'
import { normalizeLocale, resolveInitialLocale, type SupportedLocale } from './locale'
import { BUILT_IN_DEFAULT, resolveDefaultLocale } from './resolveDefaultLocale.ts'
import { isPeterWorkspace } from '../config/workspaceSurface'
import { workspaceBrandMessages } from '../config/workspaceBrand'

const messages: Partial<Record<SupportedLocale, typeof zhCN>> = {
  'zh-CN': zhCN,
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
  messages: workspaceBrandMessages(messages, isPeterWorkspace)
})

export default i18n

const localeImports = {
  'en-US': () => import('./locales/en-US.ts'),
  'ko-KR': () => import('./locales/ko-KR.ts'),
  'ru-RU': () => import('./locales/ru-RU.ts'),
}
const localeLoads = new Map<SupportedLocale, Promise<void>>()

/** Keep the native Chinese fallback; fetch another complete dictionary only when needed. */
export function ensureLocaleMessages(value: string): Promise<void> {
  const locale = normalizeLocale(value)
  if (!locale || locale === 'zh-CN') return Promise.resolve()
  const existing = localeLoads.get(locale)
  if (existing) return existing
  const pending = localeImports[locale]().then(module => {
    const branded = workspaceBrandMessages({ [locale]: module.default }, isPeterWorkspace)
    i18n.global.setLocaleMessage(locale, branded[locale])
  }).catch(error => {
    localeLoads.delete(locale)
    throw error
  })
  localeLoads.set(locale, pending)
  return pending
}

export const i18nReady = ensureLocaleMessages(initialLocale)
// Entry points await the same promise. Prevent a fast asset failure becoming
// an unhandled rejection while native authentication is still pending.
void i18nReady.catch(() => {})
