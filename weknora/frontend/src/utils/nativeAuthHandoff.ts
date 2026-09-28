/**
 * The hosted Musnow shell owns human authentication.  WeKnora only keeps the
 * short-lived native token it receives after that shell completes its exchange.
 */
export const EXTERNAL_AUTH_START_PATH = '/auth/start'
export const EXTERNAL_AUTH_ERROR_PATH = '/auth/error'
export const EXTERNAL_AUTH_LOGOUT_PATH = '/auth/logout'
export const AUTHENTICATED_HOME_PATH = '/platform/knowledge-bases'

type AuthHandoff = 'error' | 'start' | 'logout'
type LocationAssigner = Pick<Location, 'assign'>

/** Private deployments use the existing native account flow, without a hosted shell. */
export function usesNativeAuthentication(mode = import.meta.env?.VITE_AUTH_MODE): boolean {
  return mode === 'native'
}

export function hasOIDCErrorCallback(hash: string): boolean {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(fragment).has('oidc_error')
}

export function hasPendingOIDCCallback(hash: string): boolean {
  return hash.includes('oidc_result=') || hash.includes('oidc_error=')
}

/** A storage-clearing retry is safe only after the server rejected the credential. */
export function isDefinitiveNativeSessionFailure(status: unknown): boolean {
  return status === 401 || status === 403
}

/** Use a document navigation so the owning auth shell can establish/clear its session. */
export function handoffToExternalAuth(
  target: AuthHandoff,
  location: LocationAssigner = window.location,
  native = usesNativeAuthentication(),
): void {
  if (native) {
    location.assign(target === 'error' ? '/login?error=authentication_failed' : '/login')
    return
  }
  location.assign(
    target === 'start'
      ? EXTERNAL_AUTH_START_PATH
      : target === 'error'
        ? EXTERNAL_AUTH_ERROR_PATH
        : EXTERNAL_AUTH_LOGOUT_PATH,
  )
}
