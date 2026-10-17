export function workspaceBrandCopy(text: string, fire: boolean): string {
  return fire ? text.replace(/(?<![\w./:@-])musuw(?![\w./:@-])|穆苏瓦/giu, '火种') : text
}

export function workspaceBrandMessages<T>(messages: T, fire: boolean): T {
  if (!fire) return messages
  if (typeof messages === 'string') return workspaceBrandCopy(messages, true) as T
  if (Array.isArray(messages)) return messages.map(value => workspaceBrandMessages(value, true)) as T
  if (messages && typeof messages === 'object') {
    return Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, workspaceBrandMessages(value, true)])) as T
  }
  return messages
}
