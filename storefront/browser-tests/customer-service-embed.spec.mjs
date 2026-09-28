import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const widgetScriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../weknora/frontend/public/musuw-widget.js",
);

test("configured homepage mounts the existing Musuw widget at bottom-right", async ({ page }, testInfo) => {
  const storefrontOrigin = new URL(testInfo.project.use.baseURL).origin;
  await page.addInitScript(() => localStorage.setItem("musuw_locale", "zh-CN"));
  await page.route("**/_musuw/customer-service/config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      enabled: true,
      baseUrl: "https://app.musuw.com",
      channelId: "channel-homepage",
      scriptUrl: "https://app.musuw.com/musuw-widget.js",
      tokenEndpoint: `${storefrontOrigin}/_musuw/customer-service/token`,
    }),
  }));
  await page.route("https://app.musuw.com/musuw-widget.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `
      window.__customerServiceCalls = [];
      const handlers = new Map();
      window.Musuw = {
        on(event, handler) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(handler);
        },
        off(event, handler) { handlers.get(event)?.delete(handler); },
        init(options) {
          window.__customerServiceCalls.push({ type: 'init', options });
          const button = document.createElement('button');
          button.dataset.customerServiceLauncher = 'true';
          button.style.position = 'fixed';
          button.style.right = '24px';
          button.style.bottom = '24px';
          button.textContent = 'chat';
          document.body.appendChild(button);
          let ready = false;
          const widget = {
            isReady() { return ready; },
            setContext(context) { window.__customerServiceCalls.push({ type: 'context', context }); },
            setLocale(locale) { window.__customerServiceCalls.push({ type: 'locale', locale }); },
            destroy() { button.remove(); },
          };
          queueMicrotask(() => {
            ready = true;
            for (const handler of handlers.get('ready') ?? []) handler();
          });
          return widget;
        },
      };
    `,
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const launcher = page.locator('[data-customer-service-launcher="true"]');
  await expect(launcher).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    window.__customerServiceCalls.some(({ type }) => type === "locale"),
  )).toBe(true);
  const calls = await page.evaluate(() => window.__customerServiceCalls);
  expect(calls).toContainEqual({
    type: "locale",
    locale: "zh-CN",
  });
  expect(calls.find(({ type }) => type === "init")?.options).toMatchObject({
    baseUrl: "https://app.musuw.com",
    channel: "channel-homepage",
    position: "bottom-right",
    primaryColor: "#111318",
    title: "Musuw 智能客服",
  });
  const position = await launcher.evaluate((element) => {
    const style = getComputedStyle(element);
    return { bottom: style.bottom, position: style.position, right: style.right };
  });
  expect(position).toEqual({ bottom: "24px", position: "fixed", right: "24px" });
});

test("the real widget uses the Musuw shell on desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: widgetScriptPath });
  await page.evaluate(({ baseURL }) => {
    window.Musuw.init({
      baseUrl: new URL(baseURL).origin,
      channel: "style-check",
      position: "bottom-right",
      primaryColor: "#111318",
      title: "Musuw 智能客服",
      token: "ems_style_check",
    });
  }, { baseURL: testInfo.project.use.baseURL });

  const launcher = page.locator('[data-musuw-widget-launcher="true"]');
  const panel = page.locator("#musuw-widget-panel");
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("svg")).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await launcher.click();
  await expect(launcher).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  const shell = await page.evaluate(() => {
    const launcherElement = document.querySelector('[data-musuw-widget-launcher="true"]');
    const panelElement = document.querySelector("#musuw-widget-panel");
    const launcherStyle = getComputedStyle(launcherElement);
    const panelStyle = getComputedStyle(panelElement);
    return {
      launcherBackground: launcherStyle.backgroundColor,
      launcherRadius: launcherStyle.borderRadius,
      panelRadius: panelStyle.borderRadius,
      panelLeft: panelStyle.left,
      panelRight: panelStyle.right,
    };
  });
  expect(shell.launcherBackground).toBe("rgb(17, 19, 24)");
  expect(shell.launcherRadius).toBe("18px");
  expect(shell.panelRadius).toMatch(/^(18|20)px$/);
  if (testInfo.project.name === "mobile") {
    expect(shell.panelLeft).toBe("12px");
    expect(shell.panelRight).toBe("12px");
  }
});
