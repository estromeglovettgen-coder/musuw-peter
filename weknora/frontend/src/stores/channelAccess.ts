const TENANT_CHANNEL_ROLES = new Set(['viewer', 'contributor', 'admin', 'owner'])

export function resolveCanManageChannels(
  currentTenantRole: string,
  canAccessAllTenants: boolean,
): boolean {
  return canAccessAllTenants || TENANT_CHANNEL_ROLES.has(currentTenantRole)
}
