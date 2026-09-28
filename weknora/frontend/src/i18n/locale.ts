export const LOCALE_STORAGE_KEY = 'locale'
export const LOCALE_COOKIE_NAME = 'musuw_locale'

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ko-KR', 'ru-RU'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

type StorageLike = Readonly<{
  getItem(key: string): string | null
  setItem?(key: string, value: string): void
}>

export type LocaleResolutionInput = Readonly<{
  storage?: StorageLike | null
  cookie?: string | null
  languages?: readonly string[] | null
  signal?: string | null
}>

/** Convert browser/product tags to the exact tags carried by the dictionaries. */
export function normalizeLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replaceAll('_', '-').toLowerCase()
  if (normalized === '' || normalized === 'c' || normalized === 'posix') return null
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US'
  if (normalized === 'ko' || normalized.startsWith('ko-')) return 'ko-KR'
  if (normalized === 'ru' || normalized.startsWith('ru-')) return 'ru-RU'
  return null
}

function readCookie(cookie: string | null | undefined): string | null {
  if (!cookie) return null
  for (const entry of cookie.split(';')) {
    const separator = entry.indexOf('=')
    if (separator < 0) continue
    if (entry.slice(0, separator).trim() !== LOCALE_COOKIE_NAME) continue
    const value = entry.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}

function browserStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function browserCookie(): string {
  return typeof document === 'undefined' ? '' : document.cookie
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  const languages = Array.isArray(navigator.languages) ? navigator.languages : []
  return languages.length > 0 ? languages : [navigator.language]
}

/**
 * Existing preference wins; then the public homepage's country signal (a
 * shared cookie); then browser language; finally English.
 */
export function resolveInitialLocale(input: LocaleResolutionInput = {}): SupportedLocale {
  let saved: string | null = null
  try {
    saved = input.storage === undefined
      ? browserStorage()?.getItem(LOCALE_STORAGE_KEY) ?? null
      : input.storage?.getItem(LOCALE_STORAGE_KEY) ?? null
  } catch {
    saved = null
  }
  const fromStorage = normalizeLocale(saved)
  if (fromStorage !== null) return fromStorage

  const signals = input.signal === undefined
    ? [readCookie(input.cookie ?? browserCookie())]
    : [input.signal, readCookie(input.cookie ?? browserCookie())]
  for (const signal of signals) {
    const fromSignal = normalizeLocale(signal)
    if (fromSignal !== null) return fromSignal
  }

  for (const language of input.languages ?? browserLanguages()) {
    const fromBrowser = normalizeLocale(language)
    if (fromBrowser !== null) return fromBrowser
  }
  return 'en-US'
}

/** Persist only canonical supported values; malformed input cannot poison the next boot. */
export function persistLocalePreference(
  value: unknown,
  storage?: StorageLike | null,
): SupportedLocale | null {
  const locale = normalizeLocale(value)
  try {
    const target = storage === undefined ? browserStorage() : storage
    if (locale === null || target?.setItem === undefined) return null
    target.setItem(LOCALE_STORAGE_KEY, locale)
    return locale
  } catch {
    return null
  }
}
