/**
 * Shared localStorage utilities for per-user UI preferences (theme, fonts).
 *
 * Storage layout: Musuw_${userId}_${suffix}, where userId is the active
 * user's id or "anon" before login. Read paths are intentionally narrow —
 * no cross-namespace fallbacks — so one user's preferences cannot bleed
 * into another user's session.
 *
 * One-shot migration adopts pre-existing values into the current user's
 * namespace at login time:
 *   - Legacy un-namespaced keys (WeKnora_${suffix}) from earlier branch
 *     versions are inherited and removed.
 *   - The "anon" namespace (used while no user is logged in) is also
 *     adopted and cleared, so the next user to log in cannot inherit it.
 */

const PREFERENCE_SUFFIXES = [
  'theme',
  'theme_color',
  'font_sans',
  'font_mono',
  'font_size',
] as const

export function readUserId(): string {
  try {
    const raw = localStorage.getItem('weknora_user')
    if (!raw) return 'anon'
    const parsed = JSON.parse(raw)
    return parsed?.id ? String(parsed.id) : 'anon'
  } catch {
    return 'anon'
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    // Quota exceeded, disabled storage, private mode — surface in DevTools
    // so the issue is at least diagnosable, but don't break the UI.
    console.warn(`[Musuw] failed to persist preference "${key}":`, err)
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Same conditions as setItem; silent best-effort.
  }
}

export function userKey(suffix: string): string {
  return `Musuw_${readUserId()}_${suffix}`
}

export function loadPreference(suffix: string): string | null {
  const key = userKey(suffix)
  const current = safeGetItem(key)
  if (current !== null) return current
  const legacy = safeGetItem(`WeKnora_${readUserId()}_${suffix}`)
  if (legacy !== null) safeSetItem(key, legacy)
  return legacy
}

export function savePreference(suffix: string, value: string): void {
  safeSetItem(userKey(suffix), value)
  // Keep older tabs and rollback builds able to read this user's preference.
  safeSetItem(`WeKnora_${readUserId()}_${suffix}`, value)
}

let migratedForUser: string | null = null

/**
 * Adopt legacy and anon preferences into the current user's namespace, then
 * remove the source keys. Idempotent per session per user — repeat calls for
 * the same userId are no-ops. Safe to call before the user is logged in
 * (it returns early when userId === "anon").
 */
export function migratePreferencesIntoUser(): void {
  const userId = readUserId()
  if (userId === 'anon') return
  if (migratedForUser === userId) return
  let complete = true

  for (const suffix of PREFERENCE_SUFFIXES) {
    const target = `Musuw_${userId}_${suffix}`
    const oldTarget = `WeKnora_${userId}_${suffix}`
    const sourceKeys = [
      `Musuw_anon_${suffix}`, `WeKnora_anon_${suffix}`,
      `Musuw_${suffix}`, `WeKnora_${suffix}`,
    ]
    const value = safeGetItem(target) ?? safeGetItem(oldTarget)
      ?? sourceKeys.map(safeGetItem).find(v => v !== null) ?? null
    if (value !== null) {
      safeSetItem(target, value)
      // Do not discard the only copy when storage is full or disabled.
      if (safeGetItem(target) !== value) {
        complete = false
        continue
      }
      safeSetItem(oldTarget, value)
    }

    // Always clean up source keys so subsequent users cannot inherit them.
    for (const key of sourceKeys) safeRemoveItem(key)
  }
  if (complete) migratedForUser = userId
}

/** Resets the per-session migration latch (used when the active user changes). */
export function resetMigrationLatch(): void {
  migratedForUser = null
}

// Run migration once at module load so the composables that read from
// storage see post-migration values when initialising their refs.
migratePreferencesIntoUser()
