import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { applyHomepageMarketingRefresh } from "../src/homepageMarketingRefresh.js";
import { getStorefrontCopy } from "../src/i18n.js";
import { getPublicDocument } from "../src/legalContent.js";
import { applyHomepagePlanPresentation } from "../src/planPresentation.js";

const root = new URL("../", import.meta.url).pathname;
const homepageCopy = (locale) => applyHomepageMarketingRefresh(
  applyHomepagePlanPresentation(getStorefrontCopy(locale)),
);

const server = await createServer({
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  // HomePage already imports SiteChrome. Loading both concurrently can make
  // Vite request the same module twice through its SSR runner, so warm the
  // dependency graph once before reading the cached companion modules.
  const { HomePage } = await server.ssrLoadModule("/src/HomePage.jsx");
  const { SiteFooter } = await server.ssrLoadModule("/src/components/SiteChrome.jsx");
  const { LegalPage } = await server.ssrLoadModule("/src/LegalPage.jsx");
  const copy = getStorefrontCopy("en");
  const chineseCopy = getStorefrontCopy("zh-CN");
  process.stdout.write(JSON.stringify({
    home: renderToStaticMarkup(React.createElement(HomePage, { copy })),
    chineseHome: renderToStaticMarkup(
      React.createElement(HomePage, { copy: chineseCopy }),
    ),
    japanHome: renderToStaticMarkup(
      React.createElement(HomePage, { copy, pricingCurrency: "JPY" }),
    ),
    footer: renderToStaticMarkup(
      React.createElement(SiteFooter, { copy: homepageCopy("en") }),
    ),
    contact: renderToStaticMarkup(
      React.createElement(LegalPage, {
        copy,
        locale: "en",
        document: getPublicDocument("en", "/contact"),
      }),
    ),
    contactZh: renderToStaticMarkup(
      React.createElement(LegalPage, {
        copy: getStorefrontCopy("zh-CN"),
        locale: "zh-CN",
        document: getPublicDocument("zh-CN", "/contact"),
      }),
    ),
  }));
} finally {
  await server.close();
}
