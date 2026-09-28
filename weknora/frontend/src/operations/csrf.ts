const TARGET_CSRF_COOKIE_BY_PORT = {
  '4186': 'musuw_admin_csrf_test',
  '4187': 'musuw_admin_csrf_production',
} as const

const TARGET_CSRF_COOKIE_NAMES = new Set(Object.values(TARGET_CSRF_COOKIE_BY_PORT))
const LEGACY_CSRF_COOKIE_NAME = 'musuw_admin_csrf'

function parseCookies(cookieHeader: string) {
  const cookies = new Map<string, string>()
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=')
    if (separator < 1) continue
    const name = item.slice(0, separator).trim()
    if (!cookies.has(name)) cookies.set(name, item.slice(separator + 1).trim())
  }
  return cookies
}

function decodedCookie(cookies: Map<string, string>, name: string) {
  const encoded = cookies.get(name)
  if (encoded === undefined) return ''
  try {
    return decodeURIComponent(encoded)
  } catch {
    return ''
  }
}

export function operationsCsrfToken(cookieHeader: string, locationPort: string) {
  const cookies = parseCookies(cookieHeader)
  const targetCookieName = TARGET_CSRF_COOKIE_BY_PORT[locationPort as keyof typeof TARGET_CSRF_COOKIE_BY_PORT]

  if (targetCookieName && cookies.has(targetCookieName)) {
    return decodedCookie(cookies, targetCookieName)
  }

  // Cookies are shared across ports. If either namespaced cookie exists, the
  // legacy cookie is ambiguous and must not be used for the other target.
  if ([...TARGET_CSRF_COOKIE_NAMES].some((name) => cookies.has(name))) return ''

  return decodedCookie(cookies, LEGACY_CSRF_COOKIE_NAME)
}
