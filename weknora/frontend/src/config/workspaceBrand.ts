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

// Presentation-only fast path. A saved token still goes through the native
// server validation; callbacks and unavailable storage keep the normal bootstrap.
export const NATIVE_PASSWORD_ENTRY_BOOTSTRAP = `(function () {
  if (!/^\\/(?:platform(?:\\/|$)|$)/.test(location.pathname)) return;
  if (/(?:^|[#&])oidc_(?:result|error)=/.test(location.hash)) return;
  try {
    if (localStorage.getItem('weknora_token')) return;
  } catch (_) { return; }
  location.replace('/auth/start' + location.search);
})();`
