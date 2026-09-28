import assert from "node:assert/strict";
import test from "node:test";
import { structuredData } from "../src/seoMetadata.js";

test("website identity stays stable while the page carries its own URL and language", () => {
  const home = structuredData({ locale: "zh-CN", pathname: "/" })["@graph"];
  const guide = structuredData({ locale: "en", pathname: "/guides/citation-checks" })["@graph"];
  const website = (graph) => graph.find((entry) => entry["@type"] === "WebSite");
  assert.deepEqual(website(guide), website(home));
  assert.equal(website(guide).mainEntityOfPage, undefined);
  const page = guide.find((entry) => entry["@type"] === "WebPage");
  assert.ok(page);
  assert.equal(page.url, "https://musuw.com/guides/citation-checks");
  assert.equal(page.inLanguage, "en");
  assert.deepEqual(page.isPartOf, { "@id": "https://musuw.com/#website" });
});

test("article dates are explicit and breadcrumbs use existing localized destinations", () => {
  const article = { title: "Check source evidence", locale: "en", image: "/images/example.jpg",
    meta: { description: "A guide", datePublished: "2026-09-19", dateModified: "2026-09-24" } };
  const graph = structuredData({ locale: "en", pathname: "/guides/citation-checks", article })["@graph"];
  const entry = graph.find((item) => item["@type"] === "Article");
  assert.equal(entry.datePublished, "2026-09-19");
  assert.equal(entry.dateModified, "2026-09-24");
  const breadcrumb = graph.find((item) => item["@type"] === "BreadcrumbList");
  assert.deepEqual(breadcrumb.itemListElement.map(({ position, item }) => ({ position, item })), [
    { position: 1, item: "https://musuw.com/en" },
    { position: 2, item: "https://musuw.com/guides/citation-checks" },
  ]);
  const undated = structuredData({ article: { ...article, meta: { description: "No known date" } } })["@graph"].find((item) => item["@type"] === "Article");
  assert.equal(undated.datePublished, undefined);
  assert.equal(undated.dateModified, undefined);
});
