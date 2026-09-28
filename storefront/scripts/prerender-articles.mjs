import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { CITATION_GUIDES } from "../src/citationGuideContent.js";
import { NOTEBOOK_COMPARISONS } from "../src/notebookComparisonContent.js";
import { getStorefrontCopy } from "../src/i18n.js";
import { localizeDocumentResponse } from "../worker/localization.js";
import { prerenderAssetPath } from "../worker/prerender.js";
import { getPublicDocument, PUBLIC_DOCUMENT_PATHS } from "../src/legalContent.js";
import { selectPricingCurrency } from "../src/pricingLocalization.js";
import { homePath } from "../src/publicRoutes.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const shell = await readFile(join(root, "dist/index.html"), "utf8");
if (!shell.includes('<div id="root"></div>')) throw new Error("Storefront build is missing its root element");
const server = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
async function writePage(component, props, locale, path, assetPath = path, country = "") {
  const markup = renderToStaticMarkup(React.createElement(component, {
    ...props, copy: getStorefrontCopy(locale), locale, theme: "light",
  }));
  const response = await localizeDocumentResponse(new Response(
    shell.replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`),
    { headers: { "content-type": "text/html" } },
  ), locale, path, "musuw.com", country);
  const output = join(root, "dist", `${assetPath.slice(1)}.html`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, await response.text());
}
try {
  const { CitationGuidePage } = await server.ssrLoadModule("/src/CitationGuidePage.jsx");
  const { NotebookComparisonPage } = await server.ssrLoadModule("/src/NotebookComparisonPage.jsx");
  const articles = [
    ...Object.values(CITATION_GUIDES).map((guide) => ({ page: guide, component: CitationGuidePage, props: { guide } })),
    ...Object.values(NOTEBOOK_COMPARISONS).map((comparison) => ({ page: comparison, component: NotebookComparisonPage, props: { comparison } })),
  ];
  for (const { page, component, props } of articles) {
    // Flat .html files keep Cloudflare's native clean URL free of a trailing slash.
    await writePage(component, props, page.locale, page.path);
  }
  const { HomePage } = await server.ssrLoadModule("/src/HomePage.jsx");
  const { PressPage } = await server.ssrLoadModule("/src/PressPage.jsx");
  const { LegalPage } = await server.ssrLoadModule("/src/LegalPage.jsx");
  for (const locale of ["en", "zh-CN"]) {
    for (const country of ["US", "CN", "JP"]) {
      const path = homePath(locale);
      await writePage(HomePage, { pricingCurrency: selectPricingCurrency(country) }, locale, path, prerenderAssetPath(path, locale, country), country);
    }
    await writePage(PressPage, {}, locale, "/press", prerenderAssetPath("/press", locale));
    for (const path of PUBLIC_DOCUMENT_PATHS) {
      await writePage(LegalPage, { document: getPublicDocument(locale, path) }, locale, path, prerenderAssetPath(path, locale));
    }
  }
} finally {
  await server.close();
}
