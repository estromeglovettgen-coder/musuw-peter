import { useCallback, useEffect, useMemo, useState } from "react";
import { HomePage } from "./HomePage";
import { getInitialLocale, getStorefrontCopy, persistLocalePreference } from "./i18n";
import { LegalPage, NotFoundPage } from "./LegalPage";
import { PressPage } from "./PressPage";
import { CitationGuidePage } from "./CitationGuidePage";
import { NotebookComparisonPage } from "./NotebookComparisonPage";
import { NOTEBOOK_COMPARISONS, getNotebookComparison } from "./notebookComparisonContent";
import { CITATION_GUIDES, getCitationGuide } from "./citationGuideContent";
import { getPressMeta, PRESS_PATH } from "./pressContent";
import { getPublicDocument, getPublicDocumentMeta } from "./legalContent";
import { applyHomepagePlanPresentation } from "./planPresentation";
import { applyHomepageMarketingRefresh } from "./homepageMarketingRefresh";
import { getInitialPricingCountry, selectPricingCurrency } from "./pricingLocalization.js";
import {
  SITE_SOCIAL_IMAGE,
  canonicalUrl,
  normalizePathname,
  openGraphLocale,
  structuredDataText,
} from "./seoMetadata.js";
import { applyTheme, getInitialTheme } from "./theme.js";
import { CustomerServiceEmbed } from "./components/CustomerServiceEmbed.jsx";
import { HOME_PAGES, homeLocale, localeHref } from "./publicRoutes.js";

function setMeta(attribute, key, content) {
  let element = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export default function App() {
  const [locale] = useState(() => getCitationGuide(window.location.pathname)?.locale ?? getNotebookComparison(window.location.pathname)?.locale ?? getInitialLocale());
  const [theme, setTheme] = useState(() => getInitialTheme());
  const copy = useMemo(() => getStorefrontCopy(locale), [locale]);
  const pricingCurrency = selectPricingCurrency(getInitialPricingCountry(), copy.pricing.currencyCode);
  const homeMeta = useMemo(
    () => applyHomepageMarketingRefresh(applyHomepagePlanPresentation(copy)).meta,
    [copy],
  );
  const pathname = useMemo(() => window.location.pathname, []);
  const publicDocument = useMemo(() => getPublicDocument(locale, pathname), [locale, pathname]);
  const guide = getCitationGuide(pathname);
  const comparison = getNotebookComparison(pathname);
  const article = guide ?? comparison;
  const alternateArticles = comparison ? NOTEBOOK_COMPARISONS : CITATION_GUIDES;
  const isHome = Boolean(homeLocale(pathname));
  const isPress = normalizePathname(pathname) === PRESS_PATH;

  const handleLocaleChange = useCallback((nextLocale) => {
    const normalized = nextLocale === "zh-CN" || nextLocale === "zh" ? "zh-CN" : "en";
    persistLocalePreference(normalized);
    window.location.assign(localeHref(pathname, normalized, {
      search: window.location.search,
      hash: window.location.hash,
      alternatePath: article ? alternateArticles[normalized].path : undefined,
    }));
  }, [article, alternateArticles, pathname]);

  const handleThemeToggle = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const meta = article?.meta ?? getPressMeta(locale, pathname) ?? getPublicDocumentMeta(locale, pathname) ??
      (isHome ? homeMeta : {
            title: locale === "zh-CN" ? "页面未找到 | musuw" : "Page not found | musuw",
            description:
              locale === "zh-CN"
                ? "该 musuw 页面不存在或已移动。"
                : "This musuw page does not exist or has moved.",
        });
    const normalizedPath = normalizePathname(pathname);
    const pageUrl = canonicalUrl(normalizedPath);
    document.documentElement.lang = locale;
    document.title = meta.title;
    setMeta("name", "description", meta.description);
    setMeta("property", "og:site_name", "musuw");
    setMeta("property", "og:title", meta.title);
    setMeta("property", "og:description", meta.description);
    setMeta("property", "og:url", pageUrl);
    setMeta("property", "og:locale", openGraphLocale(locale));
    setMeta("property", "og:image", SITE_SOCIAL_IMAGE.url);
    setMeta("property", "og:image:alt", SITE_SOCIAL_IMAGE.alt);
    setMeta("property", "og:image:type", SITE_SOCIAL_IMAGE.type);
    setMeta("property", "og:image:width", SITE_SOCIAL_IMAGE.width);
    setMeta("property", "og:image:height", SITE_SOCIAL_IMAGE.height);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", meta.title);
    setMeta("name", "twitter:description", meta.description);
    setMeta("name", "twitter:url", pageUrl);
    setMeta("name", "twitter:image", SITE_SOCIAL_IMAGE.url);
    setMeta("name", "twitter:image:alt", SITE_SOCIAL_IMAGE.alt);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", pageUrl);
    if (article || isHome) {
      const alternates = article ? Object.values(alternateArticles) : [...HOME_PAGES, { locale: "x-default", path: "/" }];
      for (const alternate of alternates) {
        let link = document.querySelector(`link[rel="alternate"][hreflang="${alternate.locale}"]`);
        if (!link) {
          link = document.createElement("link");
          link.setAttribute("rel", "alternate");
          link.setAttribute("hreflang", alternate.locale);
          document.head.appendChild(link);
        }
        link.setAttribute("href", canonicalUrl(alternate.path));
      }
    }

    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", isHome || isPress || article || publicDocument ? "index,follow" : "noindex,follow");

    let structured = document.getElementById("musuw-structured-data");
    if (!structured) {
      structured = document.createElement("script");
      structured.id = "musuw-structured-data";
      structured.type = "application/ld+json";
      document.head.appendChild(structured);
    }
    structured.textContent = structuredDataText({ locale, pathname: normalizedPath, article });
  }, [article, alternateArticles, homeMeta, isHome, isPress, locale, pathname, publicDocument]);

  useEffect(() => {
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    if (!targetId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (comparison) {
    return <NotebookComparisonPage copy={copy} comparison={comparison} onLocaleChange={handleLocaleChange} theme={theme} onThemeToggle={handleThemeToggle} />;
  }

  if (guide) {
    return <CitationGuidePage copy={copy} guide={guide} onLocaleChange={handleLocaleChange} theme={theme} onThemeToggle={handleThemeToggle} />;
  }

  if (isPress) {
    return <PressPage copy={copy} locale={locale} onLocaleChange={handleLocaleChange} theme={theme} onThemeToggle={handleThemeToggle} />;
  }

  if (publicDocument) {
    return (
      <LegalPage
        copy={copy}
        document={publicDocument}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
    );
  }

  if (!isHome) {
    return (
      <NotFoundPage
        copy={copy}
        locale={locale}
        pathname={pathname}
        onLocaleChange={handleLocaleChange}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
    );
  }

  return (
    <div className="relative">
      <HomePage
        copy={copy}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        theme={theme}
        onThemeToggle={handleThemeToggle}
        pricingCurrency={pricingCurrency}
      />
      <CustomerServiceEmbed locale={locale} />
    </div>
  );
}
