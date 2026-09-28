import { ref } from 'vue'
import {
  loadPreference,
  savePreference,
  migratePreferencesIntoUser,
} from './preferenceStorage'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemeColor = 'musuw' | 'weknora'

const THEME_KEY = 'theme'
const THEME_COLOR_KEY = 'theme_color'

function loadTheme(): ThemeMode {
  const v = loadPreference(THEME_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'light'
}

function isThemeColor(value: string | null): value is ThemeColor {
  return value === 'musuw' || value === 'weknora'
}

function loadThemeColor(): ThemeColor {
  const value = loadPreference(THEME_COLOR_KEY)
  return isThemeColor(value) ? value : 'musuw'
}

// Shared reactive state across all consumers
const currentTheme = ref<ThemeMode>(loadTheme())
const currentThemeColor = ref<ThemeColor>(loadThemeColor())

let lastEffective: 'light' | 'dark' | null = null

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Keep the native Wails window in step with the CSS canvas without writing
 * inline DOM backgrounds. Browser surfaces must remain controlled by the
 * shared theme tokens so a normal web launch renders the approved palette. */
function syncWailsNativeChrome(effective: 'light' | 'dark') {
  const w = (window as unknown as {
    runtime?: {
      WindowSetDarkTheme?: () => void
      WindowSetLightTheme?: () => void
      WindowSetBackgroundColour?: (r: number, g: number, b: number, a: number) => void
    }
  }).runtime
  if (!w?.WindowSetBackgroundColour) return
  try {
    if (effective === 'dark') {
      w.WindowSetDarkTheme?.()
      w.WindowSetBackgroundColour(21, 22, 25, 255)
    } else {
      w.WindowSetLightTheme?.()
      w.WindowSetBackgroundColour(251, 252, 254, 255)
    }
  } catch {
    /* 非桌面壳或未注入 runtime */
  }
}

/** The inline canvas in index.html exists only for the pre-paint window.
 * Once Vue owns the theme, release it so the shared CSS tokens remain the
 * sole runtime authority across theme switches. */
function releaseBootCanvas() {
  document.documentElement.style?.removeProperty('background')
  document.documentElement.style?.removeProperty('color-scheme')
  document.body?.style?.removeProperty('background')
}

function applyTheme(mode: ThemeMode) {
  const effective = mode === 'system' ? getSystemTheme() : mode
  if (lastEffective === effective) return
  lastEffective = effective
  document.documentElement.setAttribute('theme-mode', effective)
  releaseBootCanvas()
  syncWailsNativeChrome(effective)
}

function applyThemeColor(color: ThemeColor) {
  document.documentElement.setAttribute('theme-color', color)
}

export function useTheme() {
  function setTheme(mode: ThemeMode): boolean {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return false
    currentTheme.value = mode
    savePreference(THEME_KEY, mode)
    applyTheme(mode)
    return true
  }

  function setThemeColor(color: ThemeColor): boolean {
    if (!isThemeColor(color)) return false
    currentThemeColor.value = color
    savePreference(THEME_COLOR_KEY, color)
    applyThemeColor(color)
    return true
  }

  return { currentTheme, currentThemeColor, setTheme, setThemeColor }
}

/** Call once in main.ts to initialise theme and listen for OS changes. */
export function initTheme() {
  currentTheme.value = loadTheme()
  currentThemeColor.value = loadThemeColor()
  applyTheme(currentTheme.value)
  applyThemeColor(currentThemeColor.value)

  // React to OS theme changes when user chose "system"
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme.value === 'system') {
      applyTheme('system')
    }
  })
}

/** Re-read preferences from storage (call after login / logout). */
export function reloadThemeFromStorage() {
  migratePreferencesIntoUser()
  currentTheme.value = loadTheme()
  currentThemeColor.value = loadThemeColor()
  applyTheme(currentTheme.value)
  applyThemeColor(currentThemeColor.value)
}
