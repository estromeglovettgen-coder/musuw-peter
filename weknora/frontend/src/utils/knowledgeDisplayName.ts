export interface KnowledgeDisplaySource {
  type?: unknown
  title?: unknown
  file_name?: unknown
  source?: unknown
}

const cleanText = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const isHTTPURL = (value: string): boolean => /^https?:\/\//i.test(value)

const generatedURLTitle = (item: KnowledgeDisplaySource): string => {
  if (cleanText(item.type).toLowerCase() !== 'url') return ''
  const title = cleanText(item.title)
  if (!title || isHTTPURL(title)) return ''
  return title
}

const fallbackName = (item: KnowledgeDisplaySource, fallback: string): string => {
  const fileName = cleanText(item.file_name)
  if (fileName) return fileName

  const title = cleanText(item.title)
  if (cleanText(item.type).toLowerCase() === 'url') return fallback
  return title || cleanText(item.source) || fallback
}

export const resolveKnowledgeDisplayName = (
  item: KnowledgeDisplaySource,
  fallback: string,
): string => {
  const generatedTitle = generatedURLTitle(item)
  if (generatedTitle) return generatedTitle

  const rawName = fallbackName(item, fallback)
  const dotIndex = rawName.lastIndexOf('.')
  return dotIndex > 0 ? rawName.substring(0, dotIndex) : rawName
}

export const resolveKnowledgeDetailTitle = (
  item: KnowledgeDisplaySource,
  fallback: string,
): string => generatedURLTitle(item) || fallbackName(item, fallback)
