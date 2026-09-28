import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { handleRequest } from "../worker/index.js";

// Keep the actual Worker, pre-rendered documents and built React app. Only
// Cloudflare's country and static asset bindings are local; Chromium owns the
// cookies, navigation and refresh behavior. Redirect destinations are checked
// against the same Worker before browser navigation: Playwright only routes the
// first request of a redirect chain, so fulfilling a 301 could reach production.
async function serveStorefront(context, country) {
  await context.route("**/*", async (route) => {
    const incoming = route.request();
    const url = new URL(incoming.url());
    if (!["musuw.com", "www.musuw.com"].includes(url.hostname)) return route.abort();
    const request = new Request(url, { method: incoming.method(), headers: await incoming.allHeaders() });
    Object.defineProperty(request, "cf", { value: { country } });
    const response = await handleRequest(request, {
      ASSETS: {
        async fetch(assetRequest) {
          const pathname = new URL(assetRequest.url).pathname;
          const candidates = extname(pathname) ? [pathname] : [`${pathname}.html`, "/index.html"];
          for (const path of candidates) {
            try {
              const body = await readFile(new URL(`../dist${path}`, import.meta.url));
              const type = ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json" })[extname(path)] ?? "application/octet-stream";
              return new Response(body, { headers: { "content-type": type } });
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
          }
          return new Response("Not found", { status: 404 });
        },
      },
    });
    // Never let a mocked redirect escape into the production site. Real HTTP
    // redirects are additionally verified against the preview Worker and release.
    expect(response.status >= 300 && response.status < 400, `Unisolated redirect for ${url}`).toBe(false);
    const headers = Object.fromEntries(response.headers);
    headers["x-musuw-browser-fixture"] = "local-worker";
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
}

// Assert redirect status and destination with the real Worker, without allowing
// Chromium's mocked redirect chain to make an unmocked production request.
async function redirectTarget(source, expected) {
  const response = await handleRequest(new Request(source), {
    ASSETS: { fetch: () => { throw new Error("A canonical redirect must precede static asset reads"); } },
  });
  expect(response.status).toBe(301);
  expect(response.headers.get("location")).toBe(expected);
  expect(await response.text()).toBe("");
  return response.headers.get("location");
}
function expectLocalDocument(response) {
  expect(response.status()).toBe(200);
  expect(response.headers()["x-musuw-browser-fixture"]).toBe("local-worker");
  expect(response.request().redirectedFrom()).toBeNull();
}
const homePath = (locale) => locale === "en" ? "/en" : "/";
async function chooseLanguage(page, locale, href) {
  await page.locator(".lang-select").click();
  const link = page.locator(".lang-options").getByRole("link", { name: locale === "en" ? "English" : "中文", exact: true });
  await expect(link).toHaveAttribute("href", href);
  await link.click();
}
async function expectLocale(page, locale) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator(".lang-select")).toContainText(locale === "en" ? "EN" : "ZH");
}

test.use({ reducedMotion: "reduce" });

for (const hostname of ["musuw.com", "www.musuw.com"]) {
  for (const [initial, selected] of [["zh-CN", "en"], ["en", "zh-CN"]]) {
    test(`${hostname}: Worker canonicalizes legacy ${initial} and selecting ${selected} survives browser refresh`, async ({ page, context }) => {
      await serveStorefront(context, "CN");
      const target = await redirectTarget(`https://${hostname}/?lang=${initial}&source=footer#pricing`, `https://musuw.com${homePath(initial)}?source=footer#pricing`);
      expectLocalDocument(await page.goto(target, { waitUntil: "networkidle" }));
      await expect(page).toHaveURL(target);
      await expectLocale(page, initial);
      await chooseLanguage(page, selected, homePath(selected));
      await expect(page).toHaveURL(`https://musuw.com${homePath(selected)}?source=footer#pricing`);
      await expectLocale(page, selected);
      expectLocalDocument(await page.reload({ waitUntil: "networkidle" }));
      await expectLocale(page, selected);
      const url = new URL(page.url());
      expect(url.hostname).toBe("musuw.com");
      expect(url.pathname).toBe(homePath(selected));
      expect(url.searchParams.has("lang")).toBe(false);
      expect(url.searchParams.get("source")).toBe("footer");
      expect(url.hash).toBe("#pricing");
      await expect(page.locator("#pricing")).toContainText("¥29");
    });
  }
}

test("saved and legacy www cookies cannot change a canonical homepage language", async ({ page, context }) => {
  await serveStorefront(context, "CN");
  await context.addCookies([
    { name: "musuw_locale", value: "en", domain: ".musuw.com", path: "/", secure: true },
    { name: "musuw_locale", value: "en", url: "https://www.musuw.com/" },
  ]);
  const target = await redirectTarget("https://www.musuw.com/", "https://musuw.com/");
  expectLocalDocument(await page.goto(target, { waitUntil: "networkidle" }));
  await expect(page).toHaveURL("https://musuw.com/");
  await expectLocale(page, "zh-CN");
  await chooseLanguage(page, "en", "/en");
  await expect(page).toHaveURL("https://musuw.com/en");
  await expectLocale(page, "en");
  expectLocalDocument(await page.reload({ waitUntil: "networkidle" }));
  await expectLocale(page, "en");
  expect((await context.cookies()).filter(({ name, domain }) => name === "musuw_locale" && domain === ".musuw.com").map(({ value }) => value)).toEqual(["en"]);
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expectLocale(page, "en");
  expectLocalDocument(await page.goto("https://musuw.com/", { waitUntil: "networkidle" }));
  await expectLocale(page, "zh-CN");
  expect((await context.cookies()).filter(({ name, domain }) => name === "musuw_locale" && domain === ".musuw.com").map(({ value }) => value)).toEqual(["zh-CN"]);
  await context.addCookies([{ name: "musuw_locale", value: "zh-CN", domain: ".musuw.com", path: "/", secure: true }]);
  expectLocalDocument(await page.goto("https://musuw.com/en", { waitUntil: "networkidle" }));
  await expectLocale(page, "en");
  expectLocalDocument(await page.reload({ waitUntil: "networkidle" }));
  await expectLocale(page, "en");
});

for (const path of ["/privacy", "/press"]) {
  test(`${path}: real language links preserve the selected language on refresh`, async ({ page, context }) => {
    await serveStorefront(context, "CN");
    expectLocalDocument(await page.goto(`https://musuw.com${path}?lang=en&source=footer#details`, { waitUntil: "networkidle" }));
    await expectLocale(page, "en");
    await chooseLanguage(page, "zh-CN", `${path}?lang=zh-CN`);
    await expect(page).toHaveURL(`https://musuw.com${path}?lang=zh-CN&source=footer#details`);
    await expectLocale(page, "zh-CN");
    expectLocalDocument(await page.reload({ waitUntil: "networkidle" }));
    await expectLocale(page, "zh-CN");
    await chooseLanguage(page, "en", `${path}?lang=en`);
    await expect(page).toHaveURL(`https://musuw.com${path}?lang=en&source=footer#details`);
    expectLocalDocument(await page.reload({ waitUntil: "networkidle" }));
    await expectLocale(page, "en");
  });
}

test("Japanese prices visibly identify yen in both fixed interface language routes", async ({ page, context }) => {
  await serveStorefront(context, "JP");
  const target = await redirectTarget("https://musuw.com/?lang=zh-CN#pricing", "https://musuw.com/#pricing");
  expectLocalDocument(await page.goto(target, { waitUntil: "networkidle" }));
  await expect(page).toHaveURL("https://musuw.com/#pricing");
  await expectLocale(page, "zh-CN");
  await expect(page.locator("#pricing")).toContainText("JP¥798");
  await chooseLanguage(page, "en", "/en");
  await expect(page).toHaveURL("https://musuw.com/en#pricing");
  await expectLocale(page, "en");
  await expect(page.locator("#pricing")).toContainText("JP¥798");
});
