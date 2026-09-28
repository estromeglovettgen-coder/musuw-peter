export const CUSTOMER_SERVICE_CONFIG_PATH = "/_musuw/customer-service/config";

let widgetScriptPromise = null;

export function normalizeCustomerServiceConfig(value, pageOrigin = window.location.origin) {
  if (!value?.enabled || typeof value.channelId !== "string" || !value.channelId.trim()) return null;

  try {
    const baseUrl = new URL(value.baseUrl);
    const scriptUrl = new URL(value.scriptUrl, baseUrl);
    const tokenEndpoint = new URL(value.tokenEndpoint, pageOrigin);
    if (baseUrl.protocol !== "https:" || scriptUrl.origin !== baseUrl.origin) return null;
    if (tokenEndpoint.origin !== pageOrigin) return null;
    return {
      baseUrl: baseUrl.origin,
      channelId: value.channelId.trim(),
      scriptUrl: scriptUrl.href,
      tokenEndpoint: tokenEndpoint.href,
    };
  } catch {
    return null;
  }
}

export function widgetLocale(locale) {
  return locale === "zh-CN" || locale === "zh" ? "zh-CN" : "en-US";
}

export function bindCustomerServiceWidgetReadyState(musuw, widget, { locale, page }) {
  if (!widget) return () => {};

  const applyState = () => {
    widget.setLocale(widgetLocale(locale));
    widget.setContext({ locale, page, surface: "storefront" });
  };

  musuw.on("ready", applyState);
  // The iframe can finish booting between init() and listener registration.
  // Reconcile that race without sending state before the iframe is ready.
  if (widget.isReady()) applyState();

  return () => musuw.off("ready", applyState);
}

export function loadCustomerServiceWidget(scriptUrl) {
  if (window.Musuw?.init) return Promise.resolve(window.Musuw);
  if (widgetScriptPromise) return widgetScriptPromise;

  widgetScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = scriptUrl;
    script.dataset.musuwCustomerServiceSdk = "true";
    script.addEventListener("load", () => {
      if (window.Musuw?.init) resolve(window.Musuw);
      else reject(new Error("Musuw widget SDK did not initialize"));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Musuw widget SDK failed to load")), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    widgetScriptPromise = null;
    throw error;
  });

  return widgetScriptPromise;
}
