export type SettingsNavigationItem = {
  key: string
  label: string
}

const normalizeSettingsSearch = (value: string) => value.trim().toLocaleLowerCase()

export const filterSettingsNavigation = <T extends SettingsNavigationItem>(items: readonly T[], query: string): T[] => {
  const normalized = normalizeSettingsSearch(query)
  if (!normalized) return [...items]
  return items.filter((item) => (
    item.label.toLocaleLowerCase().includes(normalized) || item.key.toLocaleLowerCase().includes(normalized)
  ))
}
