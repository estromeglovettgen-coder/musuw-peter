/**
 * Return a localized base name when it is unused, otherwise choose the first
 * available numbered variant. The caller owns localization and supplies the
 * formatter so this helper stays independent of Vue/i18n and resource APIs.
 */
export function nextAvailableLocalizedName(
  baseName: string,
  names: Iterable<unknown>,
  formatIndexedName: (index: number) => string,
): string {
  const normalizedBaseName = baseName.trim()
  const usedNames = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string') continue
    const normalizedName = name.trim()
    if (normalizedName) usedNames.add(normalizedName)
  }

  if (!usedNames.has(normalizedBaseName)) return normalizedBaseName

  let index = 2
  let candidate = formatIndexedName(index).trim()
  while (usedNames.has(candidate)) {
    index += 1
    candidate = formatIndexedName(index).trim()
  }
  return candidate
}
