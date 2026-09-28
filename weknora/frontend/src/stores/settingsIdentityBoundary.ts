/** Deep-clone authority defaults so no prior identity-owned object survives. */
export function resetSettingsForIdentityBoundary<T>(defaultSettings: T): T {
  return JSON.parse(JSON.stringify(defaultSettings)) as T
}
