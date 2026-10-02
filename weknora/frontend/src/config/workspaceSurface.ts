/** Peter exposes the full agent editor, not the whole platform administration UI.
 * This is a presentation boundary; native server authorization remains authoritative.
 */
export const isPeterWorkspace = import.meta.env?.VITE_WORKSPACE_PROFILE === 'peter'

const PETER_SETTINGS = new Set([
  'general', 'userprofile', 'models', 'mymemory', 'memory', 'chathistory', 'mcp',
  'integration-im', 'integration-embed',
  'skills', 'system-prompts',
])

const PETER_HIDDEN_KB_SECTIONS = new Set([
  'vectorStore', 'parser', 'storage', 'chunking', 'multimodal', 'asr', 'graph', 'advanced',
  'datasource', 'share', 'activity',
])

export function isWorkspaceKnowledgeBaseSectionVisible(section: string, peter = isPeterWorkspace, needsRepair = false): boolean {
  return !peter || !PETER_HIDDEN_KB_SECTIONS.has(section)
    || (needsRepair && (section === 'multimodal' || section === 'asr'))
}

export function isWorkspaceUploadSectionVisible(section: string, needsRepair = false, peter = isPeterWorkspace): boolean {
  if (!peter) return true
  return section === 'tags' || (needsRepair && (section === 'multimodal' || section === 'asr'))
}

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
