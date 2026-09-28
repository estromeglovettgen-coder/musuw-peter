import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizeDocumentResponse } from "../worker/localization.js";
import { structuredData } from "../src/seoMetadata.js";
import { CITATION_GUIDES } from "../src/citationGuideContent.js";
import { NOTEBOOK_COMPARISONS } from "../src/notebookComparisonContent.js";

const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("article metadata matches the fixed-language content before and after hydration", async () => {
  for (const article of [...Object.values(CITATION_GUIDES), ...Object.values(NOTEBOOK_COMPARISONS)]) {
    const response = await localizeDocumentResponse(new Response(shell), article.locale === "en" ? "zh-CN" : "en", article.path);
    const html = await response.text();
    const serverGraph = JSON.parse(html.match(/id="musuw-structured-data"[^>]*>(.*?)<\/script>/s)[1]);
    assert.deepEqual(serverGraph, structuredData({ locale: article.locale, pathname: article.path, article }));
    const entry = serverGraph["@graph"].find((item) => item["@type"] === "Article");
    assert.ok(entry, article.path);
    assert.equal(entry.headline, article.title);
    assert.equal(entry.description, article.meta.description);
    assert.equal(entry.inLanguage, article.locale);
    assert.equal(entry.mainEntityOfPage, `https://musuw.com${article.path}`);
    assert.equal(entry.author.name, "Musuw");
    assert.equal(entry.author.url, "https://musuw.com/");
    assert.equal(entry.image, `https://musuw.com${article.path.includes("/guides/") ? "/images/guides/cedar-cited-answer.jpg" : "/images/musuw-wiki-page.jpg"}`);
    const built = readFileSync(new URL(`../dist${article.path}.html`, import.meta.url), "utf8");
    assert.ok(built.includes(`src="${new URL(entry.image).pathname}"`), "schema image must be visible in the actual article");
    assert.equal(entry.aggregateRating, undefined);
    assert.equal(entry.datePublished, "2026-09-19", "publication date is established by the original release history");
    assert.equal(entry.dateModified, "2026-09-24");
    assert.match(built, new RegExp(`<time datetime="${entry.dateModified}">${entry.dateModified}</time>`, "i"), "visible revision date must match schema");
  }
});

test("homepage, legal documents, and missing routes do not claim to be articles", async () => {
  for (const pathname of ["/", "/privacy", "/press", "/guides/missing"]) {
    const html = await (await localizeDocumentResponse(new Response(shell), "en", pathname)).text();
    const graph = JSON.parse(html.match(/id="musuw-structured-data"[^>]*>(.*?)<\/script>/s)[1]);
    assert.ok(graph["@graph"].every((entry) => entry["@type"] !== "Article"), pathname);
  }
});
