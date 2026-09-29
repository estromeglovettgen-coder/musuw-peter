/** Peter exposes the full agent editor, not the whole platform administration UI.
 * This is a presentation boundary; native server authorization remains authoritative.
 */
export const isPeterWorkspace = import.meta.env?.VITE_WORKSPACE_PROFILE === 'peter'

const PETER_SETTINGS = new Set([
  'general', 'userprofile', 'models', 'mymemory', 'memory', 'mcp',
  'integration-im', 'integration-embed',
  'skills', 'sandbox', 'envvars',
])

export function isWorkspaceSettingsSectionVisible(section: string, peter = isPeterWorkspace): boolean {
  return !peter || PETER_SETTINGS.has(section)
}

export function workspaceRouteRedirect(path: string, section?: string, peter = isPeterWorkspace): string | null {
  if (!peter) return null
  if ([
    '/plans', '/checkout', '/pay', '/retain', '/platform/marketplace',
    '/platform/orders', '/platform/creator-products', '/platform/marketplace-admin',
    '/platform/organizations', '/platform/admin',
  ].some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return '/platform/creatChat'
  if (path === '/platform/settings' && section && !isWorkspaceSettingsSectionVisible(section, true)) {
    return '/platform/settings?section=general'
  }
  return null
}
