import { useEffect } from "react";
import {
  bindCustomerServiceWidgetReadyState,
  CUSTOMER_SERVICE_CONFIG_PATH,
  loadCustomerServiceWidget,
  normalizeCustomerServiceConfig,
} from "../customerServiceEmbed.js";

export function CustomerServiceEmbed({ locale }) {
  useEffect(() => {
    let cancelled = false;
    let widget = null;
    let unbindReadyState = null;

    async function mountWidget() {
      const response = await fetch(CUSTOMER_SERVICE_CONFIG_PATH, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return;
      const config = normalizeCustomerServiceConfig(await response.json());
      if (!config) return;

      const musuw = await loadCustomerServiceWidget(config.scriptUrl);
      if (cancelled) return;
      widget = musuw.init({
        baseUrl: config.baseUrl,
        channel: config.channelId,
        position: "bottom-right",
        primaryColor: "#111318",
        title: locale === "zh-CN" ? "Musuw 智能客服" : "Musuw AI assistant",
        tokenEndpoint: config.tokenEndpoint,
      });
      unbindReadyState = bindCustomerServiceWidgetReadyState(musuw, widget, {
        locale,
        page: window.location.href,
      });
    }

    mountWidget().catch(() => {
      // A missing or temporarily unavailable support channel must never block
      // the public homepage. The next page load retries the runtime config.
    });

    return () => {
      cancelled = true;
      unbindReadyState?.();
      widget?.destroy();
    };
  }, [locale]);

  return null;
}
