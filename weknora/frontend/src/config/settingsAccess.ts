export type SettingsRoleKey = 'viewer' | 'contributor' | 'admin' | 'owner'

/**
 * Workspace-scoped settings access policy.
 *
 * Keep this as the single frontend source of truth for both the complete
 * Settings navigation and any shortcuts that lead into it. Backend route
 * guards remain authoritative.
 */
export const SETTINGS_SECTION_MIN_ROLE: Record<string, SettingsRoleKey> = {
  general: 'viewer',
  ollama: 'admin',
  weknoracloud: 'admin',
  models: 'viewer',
  websearch: 'admin',
  chathistory: 'admin',
  vectorstore: 'admin',
  parser: 'admin',
  storage: 'admin',
  sandbox: 'admin',
  // Install writes a root shell into the sandbox image every session of
  // that config boots. Same Admin+ bar as the sandbox editor itself.
  skills: 'admin',
  mcp: 'admin',
  system: 'viewer',
  userprofile: 'viewer',
  tenant: 'viewer',
  members: 'viewer',
  mymemory: 'viewer',
  // Every member can inspect workspace memory policy; only Admin+ can save it.
  memory: 'viewer',
  // Every member fills in their own environment variables; the workspace-wide
  // values stay on the Admin+ skills page.
  envvars: 'viewer',
}

/**
 * A management-labelled avatar shortcut has a stricter threshold than the
 * corresponding read-only Settings page.
 */
export const SETTINGS_MANAGEMENT_SHORTCUT_MIN_ROLE = {
  members: 'owner',
  models: 'admin',
} as const satisfies Record<string, SettingsRoleKey>

/** Platform-managed runtime details stay out of dedicated top-level pages; when
 * exposed through Settings they remain permission-gated by the native section
 * policy above. */
export const MANAGED_RUNTIME_SETTINGS_SECTIONS = new Set([
  'ollama',
  'weknoracloud',
  'models',
  'websearch',
  'chathistory',
  'vectorstore',
  'parser',
  'storage',
  'mcp',
])

export const SYSTEM_ADMIN_SETTINGS_SECTIONS = new Set([
  'system-global',
  'runtime-queues',
  'platform-api-keys',
  'system-audit-log',
])

const MEMBER_CHANNEL_SETTINGS_SECTIONS = new Set([
  'integration-im',
  'integration-embed',
])

export function canAccessSettingsNavigationSection(
  section: string,
  canManageTenantSettings: boolean,
  isLiteMode: boolean,
): boolean {
  if (!isLiteMode) return true
  return canManageTenantSettings || MEMBER_CHANNEL_SETTINGS_SECTIONS.has(section)
}
