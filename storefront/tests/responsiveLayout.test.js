import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

function mediaBlock(styles, query) {
  const start = styles.indexOf(`@media (${query})`);
  assert.notEqual(start, -1, `${query} media block must remain present`);
  const bodyStart = styles.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < styles.length; index += 1) {
    if (styles[index] === "{") depth += 1;
    if (styles[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return styles.slice(bodyStart + 1, index);
  }
  throw new Error(`unterminated ${query} media block`);
}

function cssRule(styles, selector) {
  return styles.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, "s"))?.[0] ?? "";
}

test("storefront responsive media and final CTA rules stay bounded", () => {
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");
  const demos = readFileSync(join(root, "src/product-demos.css"), "utf8");
  const baseArticleImage = styles.match(/\.article-image\s*\{[^}]*\}/s)?.[0] ?? "";
  const baseArticleImageImage = styles.match(/\.article-image img\s*\{[^}]*\}/s)?.[0] ?? "";
  const reviewReady = styles.slice(styles.lastIndexOf("/* Review-ready storefront compositions"));
  const mobile = mediaBlock(reviewReady, "max-width: 767px");
  const tablet = mediaBlock(reviewReady, "max-width: 1023px");
  const activeTablet = mediaBlock(demos, "max-width: 1023px");
  const productWiki = cssRule(demos, "\\.kb-preview-wiki-browser");

  assert.match(baseArticleImage, /aspect-ratio:\s*1\.25\s*;/s);
  assert.match(baseArticleImageImage, /height:\s*100%\s*;/s);
  assert.match(mobile, /\.article-image\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9\s*;/s);

  assert.match(tablet, /\.final-cta-bg\s*\{[^}]*position:\s*absolute\s*;[^}]*inset:\s*0\s*;/s);
  const card = cssRule(tablet, "\\.final-cta-card");
  const copy = cssRule(tablet, "\\.final-cta-copy");
  const visual = cssRule(tablet, "\\.final-cta-visual");
  const frame = cssRule(tablet, "\\.final-cta-dashboard-frame");
  assert.match(card, /display:\s*grid\s*;/s);
  assert.match(card, /height:\s*auto\s*;/s);
  assert.match(card, /grid-template-columns:\s*minmax\(0,\s*0\.82fr\)\s+minmax\(0,\s*1\.18fr\)\s*;/s);
  assert.match(copy, /height:\s*auto\s*;/s);
  assert.match(copy, /min-width:\s*0\s*;/s);
  assert.match(visual, /height:\s*auto\s*;/s);
  assert.match(visual, /min-height:\s*0\s*;/s);
  assert.match(frame, /height:\s*auto\s*;/s);
  assert.match(frame, /aspect-ratio:\s*3\s*\/\s*2\s*;/s);
  assert.match(mobile, /\.final-cta-dashboard-frame\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10\s*;/s);
  assert.match(
    activeTablet,
    /\.final-cta-dashboard-frame\s*\{[^}]*height:\s*auto\s*;[^}]*aspect-ratio:\s*auto\s*;/s,
  );
  assert.match(
    productWiki,
    /grid-template-columns:\s*minmax\(150px,\s*25%\)\s+minmax\(0,\s*1fr\)\s*;/s,
  );
  assert.doesNotMatch(demos, /\.wiki-transfer|\.knowledge-loop-primary|\.knowledge-loop-rail/);
});

test("desktop-floor footer keeps every legal link inside the 1024px viewport", () => {
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");
  const narrowDesktop = mediaBlock(styles, "min-width: 1024px) and (max-width: 1239px");
  const footerGrid = cssRule(narrowDesktop, "\\.footer-grid");

  assert.match(
    footerGrid,
    /grid-template-columns:\s*minmax\(240px,\s*1\.75fr\)\s+repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*;/s,
  );
  assert.match(footerGrid, /gap:\s*clamp\(24px,\s*4vw,\s*48px\)\s*;/s);
});

test("mobile navigation locks scrolling and restores focus after outside dismissal", () => {
  const chrome = readFileSync(join(root, "src/components/SiteChrome.jsx"), "utf8");

  assert.match(chrome, /const headerRef = useRef\(null\)/);
  assert.match(chrome, /const previousBodyOverflow = document\.body\.style\.overflow/);
  assert.match(chrome, /document\.body\.style\.overflow = "hidden"/);
  assert.match(chrome, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(chrome, /headerRef\.current\?\.contains\(event\.target\)/);
  assert.match(chrome, /document\.body\.style\.overflow = previousBodyOverflow/);
  assert.match(chrome, /<header[\s\S]*ref=\{headerRef\}/);
});

test("marketing comparison and pricing stay aligned across desktop and mobile", () => {
  const styles = readFileSync(join(root, "src/marketing-refresh.css"), "utf8");
  const mobile = mediaBlock(styles, "max-width: 767px");
  const desktopRow = cssRule(styles, "\\.comparison-feature-row");
  const description = cssRule(styles, "\\.plan-description");

  assert.match(
    desktopRow,
    /grid-template-columns:\s*minmax\(220px,\s*1\.35fr\)\s+repeat\(4,\s*minmax\(110px,\s*0\.75fr\)\)\s*;/s,
  );
  assert.match(description, /white-space:\s*nowrap\s*;/s);
  assert.match(styles, /\.billing-discount-badge[\s\S]*background:\s*#e7f6ec\s*;/s);
  assert.match(styles, /billing-discount-badge/);
  assert.match(mobile, /\.comparison-plan-header\s*\{[^}]*display:\s*none\s*;/s);
  assert.match(
    mobile,
    /\.comparison-feature-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/s,
  );
  assert.match(mobile, /\.platform-grid\s*\{[^}]*grid-template-columns:\s*1fr\s*;/s);
  assert.match(mobile, /\.platform-card,[\s\S]*?min-height:\s*auto\s*;/s);
});
