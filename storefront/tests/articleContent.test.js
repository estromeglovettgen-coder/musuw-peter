import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { CITATION_GUIDES } from "../src/citationGuideContent.js";
import { NOTEBOOK_COMPARISONS } from "../src/notebookComparisonContent.js";
import { getStorefrontCopy } from "../src/i18n.js";

test("homepage exposes localized, crawlable guide, comparison and documentation links", async (t) => {
  const server = await createServer({ root: new URL("../", import.meta.url).pathname, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => server.close());
  const { HomeResources } = await server.ssrLoadModule("/src/components/HomeResources.jsx");
  for (const locale of ["en", "zh-CN"]) {
    const html = renderToStaticMarkup(React.createElement(HomeResources, { locale }));
    for (const href of [CITATION_GUIDES[locale].path, NOTEBOOK_COMPARISONS[locale].path, "https://docs.musuw.com/quickstart"]) {
      assert.ok(html.includes(`href="${href}"`), `${locale}: ${href} must be a real link`);
    }
    assert.equal((html.match(/<article\b/g) ?? []).length, 3);
    assert.doesNotMatch(html, /opacity:0|visibility:hidden/);
  }
});

test("articles expose structured checks, dated authorship and working localized next steps without JavaScript", async (t) => {
  const server = await createServer({ root: new URL("../", import.meta.url).pathname, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => server.close());
  const { CitationGuidePage } = await server.ssrLoadModule("/src/CitationGuidePage.jsx");
  const { NotebookComparisonPage } = await server.ssrLoadModule("/src/NotebookComparisonPage.jsx");
  for (const locale of ["en", "zh-CN"]) {
    const props = { copy: getStorefrontCopy(locale), theme: "light" };
    const guide = CITATION_GUIDES[locale];
    const comparison = NOTEBOOK_COMPARISONS[locale];
    const guideHtml = renderToStaticMarkup(React.createElement(CitationGuidePage, { ...props, guide }));
    const comparisonHtml = renderToStaticMarkup(React.createElement(NotebookComparisonPage, { ...props, comparison }));
    const home = locale === "en" ? "/en" : "/";
    for (const [html, page] of [[guideHtml, guide], [comparisonHtml, comparison]]) {
      assert.equal((html.match(/<h1>/g) ?? []).length, 1);
      assert.ok(html.includes(page.meta.author));
      assert.ok(html.includes(`<time dateTime="${page.meta.dateModified}">${page.meta.dateModified}</time>`));
      assert.ok(page.meta.datePublished <= page.meta.dateModified);
      assert.match(html, /href="https:\/\/app\.musuw\.com\/auth\/start"/);
      for (const doc of page.docs) assert.ok(html.includes(`href="${doc.href}"`));
    }
    for (const number of [1, 2, 3]) assert.ok(guideHtml.includes(`<h2>${number}. `));
    for (const verdict of guide.verdicts) assert.ok(guideHtml.includes(verdict.title));
    assert.ok(guideHtml.includes(`href="${home}#demo"`));
    assert.ok(comparisonHtml.includes(`href="${home}#pricing"`));
    assert.match(comparisonHtml, locale === "en" ? /not tested in a performance comparison/ : /未做性能对测/);
  }
});
