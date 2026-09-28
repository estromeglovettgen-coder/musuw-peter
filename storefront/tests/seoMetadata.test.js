import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { localizeDocumentResponse } from "../worker/localization.js";
import { SITE_SOCIAL_IMAGE } from "../src/seoMetadata.js";
import { getStorefrontCopy } from "../src/i18n.js";
import { applyHomepagePlanPresentation } from "../src/planPresentation.js";
import { applyHomepageMarketingRefresh } from "../src/homepageMarketingRefresh.js";

const root = new URL("../", import.meta.url).pathname;
const repositoryRoot = new URL("../../", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function pngDimensions(path) {
  const bytes = readFileSync(join(root, path));
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${path} must be a PNG`,
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function icoSizes(path) {
  const bytes = readFileSync(join(root, path));
  assert.equal(bytes.readUInt16LE(0), 0, `${path} must have an ICO reserved field`);
  assert.equal(bytes.readUInt16LE(2), 1, `${path} must be an icon resource`);
  const count = bytes.readUInt16LE(4);
  return [...Array(count)].map((_, index) => {
    const offset = 6 + index * 16;
    const width = bytes[offset] || 256;
    const height = bytes[offset + 1] || 256;
    return `${width}x${height}`;
  });
}

test("storefront publishes one canonical Musuw identity across crawl metadata", () => {
  const html = read("index.html");
  for (const token of [
    '<link rel="canonical" href="https://musuw.com/"',
    'rel="icon" href="/favicon.ico',
    'sizes="32x32" href="/favicon-32x32.png',
    'rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png',
    'rel="manifest" href="/site.webmanifest?v=20260822"',
    `property="og:image" content="${SITE_SOCIAL_IMAGE.url}"`,
    `property="og:image:alt" content="${SITE_SOCIAL_IMAGE.alt}"`,
    'property="og:image:width" content="1200"',
    'property="og:image:height" content="630"',
    'name="twitter:card" content="summary_large_image"',
    `name="twitter:image" content="${SITE_SOCIAL_IMAGE.url}"`,
    'id="musuw-structured-data"',
    '"https://musuw.com/musuw-logo-512.png"',
  ]) {
    assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /"@type"\s*:\s*"Organization"/);
  assert.match(html, /"@type"\s*:\s*"WebSite"/);
  assert.doesNotMatch(html, /Musnow|ClientHub|weknora\/web|circle|rounded/i);
  assert.equal(html.match(/<title>(.*?)<\/title>/)[1], html.match(/property="og:title" content="([^"]+)"/)[1]);
  assert.deepEqual(pngDimensions("public/images/musuw-social-card.png"), { width: 1200, height: 630 });
  assert.ok(statSync(join(root, "public/images/musuw-social-card.png")).size < 1_000_000);
});

test("derived Musuw icon files are square, transparent-friendly, and crawlable", () => {
  for (const [path, width, height] of [
    ["public/favicon-32x32.png", 32, 32],
    ["public/apple-touch-icon.png", 180, 180],
    ["public/musuw-logo-192.png", 192, 192],
    ["public/musuw-logo-512.png", 512, 512],
  ]) {
    assert.ok(statSync(join(root, path)).size > 100, `${path} must not be empty`);
    assert.deepEqual(pngDimensions(path), { width, height });
  }
  assert.deepEqual(icoSizes("public/favicon.ico"), ["16x16", "32x32", "48x48"]);
  const manifest = JSON.parse(read("public/site.webmanifest"));
  assert.equal(manifest.name, "musuw");
  assert.equal(manifest.short_name, "musuw");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
    [
      { src: "/musuw-logo-192.png", sizes: "192x192", type: "image/png" },
      { src: "/musuw-logo-512.png", sizes: "512x512", type: "image/png" },
    ],
  );
});

test("auth and consumer application entry points are private to crawlers", (t) => {
  const authPath = join(repositoryRoot, "auth/index.html");
  if (!existsSync(authPath)) {
    t.skip("External auth application entry points not present in standalone storefront repository");
    return;
  }
  for (const path of ["auth/index.html", "weknora/frontend/index.html"]) {
    const filePath = join(repositoryRoot, path);
    if (!existsSync(filePath)) continue;
    const html = readFileSync(filePath, "utf8");
    assert.match(
      html,
      /<meta\s+(?:name=["']robots["']\s+content=["']noindex,nofollow["']|content=["']noindex,nofollow["']\s+name=["']robots["'])/i,
      path,
    );
    assert.doesNotMatch(html, /Musnow|ClientHub|weknora\/web/i, path);
  }
  const opsPath = join(repositoryRoot, "weknora/frontend/operations.html");
  if (existsSync(opsPath)) {
    assert.match(
      readFileSync(opsPath, "utf8"),
      /noindex,nofollow/,
    );
  }
  const embedPath = join(repositoryRoot, "weknora/frontend/embed.html");
  if (existsSync(embedPath)) {
    assert.match(
      readFileSync(embedPath, "utf8"),
      /<link rel="icon" href="data:,">/,
    );
  }
});

test("the sitemap keeps every public Musuw route current and canonical", () => {
  const sitemap = read("public/sitemap.xml");
  const routes = [
    "/",
    "/en",
    "/terms",
    "/privacy",
    "/refund-policy",
    "/subscription-policy",
    "/acceptable-use",
    "/cookies",
    "/security",
    "/contact",
    "/press",
    "/guides/citation-checks",
    "/zh/guides/citation-checks",
    "/compare/notebooklm",
    "/zh/compare/notebooklm",
  ];
  for (const pathname of routes) {
    const lastmod = (["/", "/en", "/press", "/privacy", "/cookies"].includes(pathname) || pathname.endsWith("/guides/citation-checks") || pathname.endsWith("/compare/notebooklm")) ? "2026-09-24" : ["/terms", "/refund-policy", "/subscription-policy"].includes(pathname)
      ? "2026-08-29"
      : "2026-08-22";
    assert.match(sitemap, new RegExp(`<loc>https://musuw\\.com${pathname === "/" ? "/" : pathname}</loc><lastmod>${lastmod}</lastmod>`));
  }
  assert.doesNotMatch(sitemap, /Musnow|ClientHub|weknora|www\.musuw\.com/i);
});

test("the Worker keeps localized social metadata and structured data aligned", async () => {
  const source = new Response(
    `<!doctype html><html lang="en"><head>
    <title>musuw | Evidence-first personal knowledge base</title>
    <meta name="description" content="Home">
    <link rel="canonical" href="https://musuw.com/">
    <meta property="og:title" content="musuw | Evidence-first personal knowledge base">
    <meta property="og:description" content="Home">
    <meta property="og:url" content="https://musuw.com/">
    <meta property="og:locale" content="en_US">
    <meta name="twitter:title" content="musuw | Evidence-first personal knowledge base">
    <meta name="twitter:description" content="Home">
    <meta name="twitter:url" content="https://musuw.com/">
    <script id="musuw-structured-data" type="application/ld+json">{"inLanguage":"en"}</script>
  </head><body></body></html>`,
    { headers: { "content-type": "text/html" } },
  );
  const response = await localizeDocumentResponse(source, "zh-CN", "/privacy");
  const html = await response.text();

  assert.match(html, /<title>隐私政策 \| musuw<\/title>/);
  assert.match(html, /<meta property="og:title" content="隐私政策 \| musuw">/);
  assert.match(html, /<meta property="og:description" content="本政策说明/);
  assert.match(html, /<meta property="og:url" content="https:\/\/musuw\.com\/privacy">/);
  assert.match(html, /<meta property="og:locale" content="zh_CN">/);
  assert.match(html, /<meta name="twitter:title" content="隐私政策 \| musuw">/);
  assert.match(html, /<meta name="twitter:url" content="https:\/\/musuw\.com\/privacy">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/musuw\.com\/images\/musuw-social-card\.png">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /id="musuw-structured-data"[\s\S]*"inLanguage":"zh-CN"/);
  assert.match(html, /"https:\/\/musuw\.com\/privacy"/);
  assert.match(html, /"https:\/\/musuw\.com\/musuw-logo-512\.png"/);
});

test("homepage previews keep the current localized title and one large image before hydration", async () => {
  for (const locale of ["en", "zh-CN"]) {
    const path = locale === "en" ? "/en" : "/";
    const meta = applyHomepageMarketingRefresh(applyHomepagePlanPresentation(getStorefrontCopy(locale))).meta;
    const response = await localizeDocumentResponse(new Response(read("index.html"), {
      headers: { "content-type": "text/html" },
    }), locale, path);
    const html = await response.text();
    assert.ok(html.includes(`<title>${meta.title}</title>`));
    assert.ok(html.includes(`<meta property="og:title" content="${meta.title}">`));
    assert.ok(html.includes(`<meta name="twitter:description" content="${meta.description}">`));
    assert.equal((html.match(/property="og:image"/g) || []).length, 1);
    assert.ok(html.includes(`<meta property="og:image" content="${SITE_SOCIAL_IMAGE.url}">`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.ok(html.includes(`<link rel="canonical" href="https://musuw.com${path}">`));
  }
});
