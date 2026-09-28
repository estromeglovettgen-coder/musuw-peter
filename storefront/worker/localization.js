import { getStorefrontCopy, localePreferenceCookie } from "../src/i18n.js";
import { getPublicDocumentMeta } from "../src/legalContent.js";
import { getPressMeta } from "../src/pressContent.js";
import { CITATION_GUIDES, getCitationGuide } from "../src/citationGuideContent.js";
import { NOTEBOOK_COMPARISONS, getNotebookComparison } from "../src/notebookComparisonContent.js";
import { applyHomepagePlanPresentation } from "../src/planPresentation.js";
import { applyHomepageMarketingRefresh } from "../src/homepageMarketingRefresh.js";
import { normalizeCountry } from "../src/pricingLocalization.js";
import { HOME_PAGES, homeLocale } from "../src/publicRoutes.js";
import {
  SITE_SOCIAL_IMAGE,
  canonicalUrl,
  normalizePathname,
  openGraphLocale,
  structuredDataText,
} from "../src/seoMetadata.js";

function supportedLocale(value) {
  if (value === "zh-CN") return "zh-CN";
  if (value === "en") return "en";
  return null;
}

function savedLocale(cookieHeader) {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== "musuw_locale") continue;
    try {
      return supportedLocale(decodeURIComponent(entry.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

export function selectLocale(country, cookieHeader = "", requestedLocale = "") {
  const normalizedCountry = normalizeCountry(country);
  return (
    supportedLocale(requestedLocale) ??
    savedLocale(cookieHeader) ??
    (normalizedCountry === "CN" ? "zh-CN" : "en")
  );
}

function normalizeDocumentPath(pathname) {
  return normalizePathname(pathname);
}

function withDocumentLocale(html, locale, pathname = "/", country = "") {
  const copy = getStorefrontCopy(locale);
  const normalizedPath = normalizeDocumentPath(pathname);
  const comparison = getNotebookComparison(normalizedPath);
  const article = getCitationGuide(normalizedPath) ?? comparison;
  const pageMeta = article?.meta ?? getPublicDocumentMeta(locale, normalizedPath) ?? getPressMeta(locale, normalizedPath);
  const isHome = Boolean(homeLocale(normalizedPath));
  const meta =
    pageMeta ??
    (isHome
      ? applyHomepageMarketingRefresh(applyHomepagePlanPresentation(copy)).meta
      : {
          title: locale === "zh-CN" ? "页面未找到 | musuw" : "Page not found | musuw",
          description:
            locale === "zh-CN"
              ? "该 musuw 页面不存在或已移动。"
              : "This musuw page does not exist or has moved.",
        });
  const escapeAttribute = (value) =>
    value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const escapeText = (value) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const upsertHead = (document, pattern, markup) =>
    pattern.test(document)
      ? document.replace(pattern, markup)
      : document.includes("</head>")
        ? document.replace("</head>", `${markup}</head>`)
        : `${markup}${document}`;
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const upsertMeta = (document, attribute, key, content) => {
    const pattern = new RegExp(
      `<meta\\s+${attribute}\\s*=\\s*["']${escapeRegExp(key)}["'][^>]*>`,
      "i",
    );
    return upsertHead(
      document,
      pattern,
      `<meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(content)}">`,
    );
  };

  let localizedHtml = html.replace(/<html\b([^>]*)>/i, (_match, attributes) => {
    const withoutLang = attributes.replace(/\s+lang=(?:"[^"]*"|'[^']*')/i, "");
    return `<html${withoutLang} lang="${locale}">`;
  });
  localizedHtml = upsertHead(
    localizedHtml,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeText(meta.title)}</title>`,
  );
  const pageUrl = canonicalUrl(normalizedPath);
  for (const [attribute, key, content] of [
    ["name", "description", meta.description],
    ["name", "robots", isHome || pageMeta ? "index,follow" : "noindex,follow"],
    ["property", "og:site_name", "musuw"],
    ["property", "og:title", meta.title],
    ["property", "og:description", meta.description],
    ["property", "og:url", pageUrl],
    ["property", "og:locale", openGraphLocale(locale)],
    ["property", "og:image", SITE_SOCIAL_IMAGE.url],
    ["property", "og:image:alt", SITE_SOCIAL_IMAGE.alt],
    ["property", "og:image:type", SITE_SOCIAL_IMAGE.type],
    ["property", "og:image:width", SITE_SOCIAL_IMAGE.width],
    ["property", "og:image:height", SITE_SOCIAL_IMAGE.height],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", meta.title],
    ["name", "twitter:description", meta.description],
    ["name", "twitter:url", pageUrl],
    ["name", "twitter:image", SITE_SOCIAL_IMAGE.url],
    ["name", "twitter:image:alt", SITE_SOCIAL_IMAGE.alt],
  ]) {
    localizedHtml = upsertMeta(localizedHtml, attribute, key, content);
  }
  localizedHtml = upsertHead(
    localizedHtml,
    /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?\s*>/i,
    `<link rel="canonical" href="${escapeAttribute(pageUrl)}">`,
  );
  if (article || isHome) {
    const alternates = article ? Object.values(comparison ? NOTEBOOK_COMPARISONS : CITATION_GUIDES) : [...HOME_PAGES, { locale: "x-default", path: "/" }];
    for (const alternate of alternates) {
      localizedHtml = upsertHead(
        localizedHtml,
        new RegExp(`<link\\s+rel=["']alternate["']\\s+hreflang=["']${alternate.locale}["'][^>]*>`, "i"),
        `<link rel="alternate" hreflang="${alternate.locale}" href="${canonicalUrl(alternate.path)}">`,
      );
    }
  }
  const structuredMarkup = `<script id="musuw-structured-data" type="application/ld+json">${structuredDataText({ locale, pathname: normalizedPath, article })}</script>`;
  localizedHtml = upsertHead(
    localizedHtml,
    /<script\s+id=["']musuw-structured-data["'][^>]*>[\s\S]*?<\/script>/i,
    structuredMarkup,
  );
  const bootstrap = `<script id="musuw-locale-bootstrap">window.__MUSUW_LOCALE__=${JSON.stringify(locale)};window.__MUSUW_COUNTRY__=${JSON.stringify(normalizeCountry(country))}</script>`;
  return upsertHead(localizedHtml, /<script\s+id=["']musuw-locale-bootstrap["'][^>]*>[\s\S]*?<\/script>/i, bootstrap);
}

export async function localizeDocumentResponse(
  assetResponse,
  locale,
  pathname = "/",
  hostname = "musuw.com",
  country = "",
) {
  const normalizedLocale = homeLocale(pathname) ?? getCitationGuide(pathname)?.locale ?? getNotebookComparison(pathname)?.locale ?? (locale === "zh-CN" ? "zh-CN" : "en");
  const normalizedPath = normalizeDocumentPath(pathname);
  const knownDocument =
    Boolean(homeLocale(normalizedPath)) || Boolean(getCitationGuide(normalizedPath) ?? getNotebookComparison(normalizedPath) ?? getPublicDocumentMeta(normalizedLocale, normalizedPath) ?? getPressMeta(normalizedLocale, normalizedPath));
  const headers = new Headers(assetResponse.headers);
  headers.set("content-language", normalizedLocale);
  headers.set("cache-control", "private, no-store");
  const vary = new Set(
    (headers.get("vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  vary.add("CF-IPCountry");
  vary.add("Cookie");
  headers.set("vary", [...vary].join(", "));
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  headers.set("set-cookie", localePreferenceCookie(normalizedLocale, hostname));
  const html = withDocumentLocale(
    await assetResponse.text(),
    normalizedLocale,
    normalizedPath,
    country,
  );
  const status = knownDocument ? assetResponse.status : 404;
  return new Response(html, {
    status,
    statusText: status === assetResponse.status ? assetResponse.statusText : "Not Found",
    headers,
  });
}
