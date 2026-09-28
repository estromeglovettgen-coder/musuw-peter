export const SITE_ORIGIN = "https://musuw.com";
export const SITE_NAME = "musuw";
export const SITE_LOGO_PATH = "/musuw-logo-512.png";
export const SITE_LOGO_URL = `${SITE_ORIGIN}${SITE_LOGO_PATH}`;
export const SITE_LOGO_ALT = "musuw logo";
export const SITE_SOCIAL_IMAGE = Object.freeze({
  url: `${SITE_ORIGIN}/images/musuw-social-card.png`,
  alt: "Musuw: cited answers, connected Wiki, and knowledge graph; actual product screenshot with an example document",
  type: "image/png",
  width: "1200",
  height: "630",
});

export function normalizePathname(pathname = "/") {
  if (!pathname || pathname === "/") return "/";
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function canonicalUrl(pathname = "/") {
  return `${SITE_ORIGIN}${normalizePathname(pathname)}`;
}

export function openGraphLocale(locale) {
  return locale === "zh-CN" ? "zh_CN" : "en_US";
}

export function structuredData({ locale = "en", pathname = "/", article } = {}) {
  const pageUrl = canonicalUrl(pathname);
  const language = locale === "zh-CN" ? "zh-CN" : "en";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#organization`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        logo: SITE_LOGO_URL,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        publisher: { "@id": `${SITE_ORIGIN}/#organization` },
        inLanguage: ["zh-CN", "en"],
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        inLanguage: language,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        ...(article ? { name: article.title, breadcrumb: { "@id": `${pageUrl}#breadcrumb` } } : {}),
      },
      ...(article ? [{
        "@type": "Article",
        "@id": `${canonicalUrl(pathname)}#article`,
        headline: article.title,
        description: article.meta.description,
        image: `${SITE_ORIGIN}${article.image}`,
        inLanguage: article.locale,
        mainEntityOfPage: canonicalUrl(pathname),
        author: { "@type": "Organization", name: "Musuw", url: `${SITE_ORIGIN}/` },
        publisher: { "@id": `${SITE_ORIGIN}/#organization` },
        isAccessibleForFree: true,
        ...(article.meta.datePublished ? { datePublished: article.meta.datePublished } : {}),
        ...(article.meta.dateModified ? { dateModified: article.meta.dateModified } : {}),
      }, {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: language === "zh-CN" ? "首页" : "Home", item: canonicalUrl(language === "zh-CN" ? "/" : "/en") },
          { "@type": "ListItem", position: 2, name: article.title, item: pageUrl },
        ],
      }] : []),
    ],
  };
}

export function structuredDataText(options) {
  return JSON.stringify(structuredData(options))
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
