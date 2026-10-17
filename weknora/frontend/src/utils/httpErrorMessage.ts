export function httpErrorMessageKey(status: number, body?: string): string | undefined {
  if (status === 431 || (status === 400 && /request header(?: or cookie)? too large/i.test(body || ''))) return 'error.requestHeadersTooLarge'
  if (/<(?:!doctype|html|head|body)\b/i.test(body || '')) return 'error.serverUnavailable'
  return undefined
}
