export const STOREFRONT_AUTH_STATUS_URL = "https://app.musuw.com/v1/auth/status";
export const STOREFRONT_AUTH_STATUS_TIMEOUT_MS = 1_200;

export async function readStorefrontAuthentication({
  fetchImpl = globalThis.fetch,
  timeoutMs = STOREFRONT_AUTH_STATUS_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") return false;

  const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : STOREFRONT_AUTH_STATUS_TIMEOUT_MS;
  const controller = new AbortController();
  let timeoutId;

  const request = Promise.resolve()
    .then(() => fetchImpl(STOREFRONT_AUTH_STATUS_URL, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }))
    .then(async (response) => {
      if (!response?.ok) return false;
      const payload = await response.json();
      return payload?.data?.authenticated === true;
    })
    .catch(() => false);

  const deadline = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, boundedTimeout);
  });

  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timeoutId);
  }
}
