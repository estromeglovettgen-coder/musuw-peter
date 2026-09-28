import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  benefits,
  comparisonGroups,
  customerMarks,
  features,
  priceBooks,
  plans,
  testimonials,
  workflows,
} from "../src/data/homeContent.js";
import {
  applyHomepageMarketingRefresh,
  MARKETING_NAVIGATION,
} from "../src/homepageMarketingRefresh.js";
import { getStorefrontCopy } from "../src/i18n.js";
import { getPublicDocument, PUBLIC_DOCUMENT_PATHS } from "../src/legalContent.js";
import { applyHomepagePlanPresentation } from "../src/planPresentation.js";

const root = new URL("../", import.meta.url).pathname;

function collectStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, result));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, result));
  }
  return result;
}

function homepageCopy(locale) {
  return applyHomepageMarketingRefresh(
    applyHomepagePlanPresentation(getStorefrontCopy(locale)),
  );
}

test("public copy presents the exact lowercase musuw brand without stale names or fabricated proof", () => {
  for (const locale of ["en", "zh-CN"]) {
    const copy = homepageCopy(locale);
    const allCopy = collectStrings(copy).join("\n");

    assert.match(copy.meta.title, /musuw/);
    assert.doesNotMatch(allCopy, /Musnow/);
    assert.match(copy.meta.description, locale === "zh-CN" ? /知识|资料/ : /knowledge|sources/i);
    assert.match(allCopy, locale === "zh-CN" ? /精确引用|原文引用/ : /exact (?:source )?citations?/i);
    assert.match(allCopy, locale === "zh-CN" ? /知识图谱/ : /knowledge graph/i);
    assert.match(allCopy, locale === "zh-CN" ? /持续完善|持续维护/ : /keep building|keeps evolving/i);
    assert.match(allCopy, locale === "zh-CN" ? /30\+ 主流模型/ : /30\+ leading models/i);
    assert.match(allCopy, locale === "zh-CN" ? /YouTube.*抖音/ : /YouTube.*TikTok/i);
    assert.match(allCopy, locale === "zh-CN" ? /导出/ : /export/i);
    assert.doesNotMatch(allCopy, /ClientHub|client portal/);
    assert.doesNotMatch(allCopy, /1,000\+|4\.8\s+Trusted|深受服务团队信赖/);
    assert.doesNotMatch(allCopy, /2028/);
  }

  const dataSource = readFileSync(join(root, "src/data/homeContent.js"), "utf8");
  assert.doesNotMatch(dataSource, /Jonathan Hayes|Clearframe Agency|Portivio|ClientHub/);
});

test("public capability copy explains evidence, structure, relationships, and reuse without binding the product to one domain", () => {
  const englishDefaults = collectStrings({
    benefits,
    comparisonGroups,
    customerMarks,
    features,
    plans,
    testimonials,
    workflows,
  }).join("\n");
  const publicDocuments = ["en", "zh-CN"]
    .flatMap((locale) => PUBLIC_DOCUMENT_PATHS.map((path) => getPublicDocument(locale, path)))
    .map((document) => collectStrings(document).join("\n"))
    .join("\n");
  const homepageEnglish = collectStrings(homepageCopy("en")).join("\n");
  const homepageChinese = collectStrings(homepageCopy("zh-CN")).join("\n");
  const allVisibleCopy = [englishDefaults, homepageEnglish, homepageChinese, publicDocuments].join("\n");

  assert.doesNotMatch(
    allVisibleCopy,
    /reviewable (?:changes|knowledge|high-impact changes)|answer review|saved-answer review|review decisions|accept(?:ed)?,? or reject|accepted, rejected|review before acceptance|review contradictions|review high-impact changes|change control|visible diffs|可审查变更|可审查的重要变更|可以审核的知识|答案(?:保存与)?审核|审查决定|接受或拒绝|接受、拒绝|接受前先审核|审核相互矛盾的信息|审核高影响变化|变化控制/i,
  );

  assert.match(homepageEnglish, /Find and verify across sources/);
  assert.match(homepageEnglish, /Organize sources, findings, and context/);
  assert.match(homepageEnglish, /backlinks/i);
  assert.match(homepageEnglish, /30\+ leading models/);
  assert.match(homepageEnglish, /One-click web and video import/);
  assert.match(homepageEnglish, /Keep existing knowledge current/);
  assert.match(homepageEnglish, /Exact citations/i);

  assert.doesNotMatch(homepageChinese, /RAG|Agent/);
  assert.match(homepageChinese, /智能体问答/);
  assert.match(homepageChinese, /将资料、结论与来源组织为相互链接的 Wiki 页面/);
  assert.match(homepageChinese, /反向链接/);
  assert.match(homepageChinese, /30\+ 主流模型接入/);
  assert.match(homepageChinese, /文章与视频一键入库/);
  assert.match(homepageChinese, /持续更新既有知识/);
  assert.match(homepageChinese, /精确(?:原文)?引用/);
  assert.match(homepageChinese, /页面、实体、概念与来源/);
  assert.doesNotMatch(homepageChinese, /找不到已有内容/);
});

test("consumer pricing presents aligned descriptions, capacity, model access, and annual savings", () => {
  for (const locale of ["en", "zh-CN"]) {
    const pricing = homepageCopy(locale).pricing;
    assert.match(
      pricing.intro.body,
      locale === "zh-CN" ? /容量.*视频导入.*高级模型/ : /capacity.*video import.*advanced models/i,
    );
    assert.equal(pricing.plans.length, 4);
    assert.match(pricing.yearlyDiscount, /17%/);
    assert.deepEqual(
      pricing.plans.map((plan) => plan.features[0]),
      locale === "zh-CN"
        ? ["1 GiB 存储空间", "10 GiB 存储空间", "30 GiB 存储空间", "100 GiB 存储空间"]
        : ["1 GiB storage", "10 GiB storage", "30 GiB storage", "100 GiB storage"],
    );
    pricing.plans.forEach((plan) => assert.ok(plan.description.length <= 40));
    const freeFeatures = pricing.plans[0].features.join(" ");
    assert.match(freeFeatures, locale === "zh-CN" ? /标准模型/ : /Standard models/);
    assert.doesNotMatch(freeFeatures, /网页|web links/i);
    assert.match(freeFeatures, locale === "zh-CN" ? /文档与笔记/ : /Documents and notes/);
    pricing.plans.slice(1).forEach((plan) => {
      assert.match(plan.features.join(" "), locale === "zh-CN" ? /高级模型/ : /Advanced models/);
    });
    assert.doesNotMatch(pricing.plans.flatMap((plan) => plan.features).join(" "), /\$\d/);
  }

  assert.match(plans[0].features.join(" "), /1 GiB.*\$0\.40.*1 knowledge base.*10 documents/i);
  assert.match(plans[1].features.join(" "), /10 GiB.*\$1\.25.*Expanded platform-approved catalog/i);
  assert.match(plans[2].features.join(" "), /30 GiB.*\$2\.50.*Expanded platform-approved catalog/i);
  assert.match(plans[3].features.join(" "), /100 GiB.*\$5\.00.*Expanded platform-approved catalog/i);
});

test("regional price books expose exact monthly and annual totals for all four plans", () => {
  assert.deepEqual(priceBooks.USD, [
    { monthly: 0, yearlyTotal: 0 },
    { monthly: 5, yearlyTotal: 49 },
    { monthly: 10, yearlyTotal: 99 },
    { monthly: 20, yearlyTotal: 199 },
  ]);
  assert.deepEqual(priceBooks.CNY, [
    { monthly: 0, yearlyTotal: 0 },
    { monthly: 29, yearlyTotal: 289 },
    { monthly: 59, yearlyTotal: 589 },
    { monthly: 129, yearlyTotal: 1289 },
  ]);
  assert.deepEqual(priceBooks.JPY, [
    { monthly: 0, yearlyTotal: 0 },
    { monthly: 798, yearlyTotal: 7816 },
    { monthly: 1595, yearlyTotal: 15791 },
    { monthly: 3190, yearlyTotal: 31741 },
  ]);
  assert.equal(plans[0].key, "free");
  assert.equal(plans[3].key, "max");
  assert.notEqual(plans[3].available, false);
});

test("homepage keeps the smooth hero while removing examples and repeated workflow sections", () => {
  const homePage = readFileSync(join(root, "src/HomePage.jsx"), "utf8");
  const sectionOrder = [
    "HeroScene",
    "FeaturesSection",
    "PlatformSection",
    "MarketingPricingSection",
    "MarketingComparisonSection",
    "FAQSection",
    "FinalCTA",
  ];
  let previousIndex = -1;
  for (const section of sectionOrder) {
    const index = homePage.indexOf(`<${section}`);
    assert.ok(index > previousIndex, `${section} must remain in the approved homepage order`);
    previousIndex = index;
  }
  assert.doesNotMatch(homePage, /<WorkflowSection\b|<BlogPreviewSection\b/);

  const heroSource = readFileSync(join(root, "src/components/HeroScene.jsx"), "utf8");
  assert.match(heroSource, /className="dashboard-scene"/);
  assert.match(heroSource, /sampleHeroVisibility/);
  assert.match(heroSource, /<HeroProductDemo locale=\{locale\}/);
  assert.doesNotMatch(heroSource, /<video|musuw-overview\.webm/);
  assert.match(heroSource, /id="demo"/);
  assert.doesNotMatch(heroSource, /hero-float/);

  assert.deepEqual(
    MARKETING_NAVIGATION.map(({ label }) => label),
    ["Features", "Platform", "Pricing", "Security", "Contact", "Docs"],
  );

  const expectedAssets = new Set([
    "/images/musuw-query-citation.jpg",
    "/images/musuw-knowledge-base.jpg",
    "/images/musuw-wiki-page.jpg",
    "/images/musuw-wiki-graph.jpg",
  ]);
  const evidenceSources = [
    "index.html",
    "src/data/homeContent.js",
    "src/components/HeroScene.jsx",
    "src/components/HomeSections.jsx",
    "src/homepageMarketingRefresh.js",
  ].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
  const referencedAssets = new Set(
    [...evidenceSources.matchAll(/\/images\/(musuw-[a-z-]+\.jpg)/g)]
      .map((match) => `/images/${match[1]}`),
  );
  assert.deepEqual(
    [...referencedAssets].sort(),
    [...expectedAssets].sort(),
    "the owned screenshot inventory must remain limited to Query, Knowledge Base, Wiki page, and graph captures",
  );
  for (const asset of expectedAssets) {
    const file = join(root, "public", asset.replace(/^\//, ""));
    assert.ok(existsSync(file), `${asset} must exist in public assets`);
    assert.ok(statSync(file).size > 10_000, `${asset} must contain a real product screenshot`);
  }

  for (const component of [
    "src/components/HeroScene.jsx",
    "src/components/HomeSections.jsx",
    "src/components/HomeRefreshSections.jsx",
  ]) {
    const source = readFileSync(join(root, component), "utf8");
    assert.doesNotMatch(
      source,
      /hero-dashboard-hd|activity-card-hd|deliverable-card-hd|project-list|approval-detail/,
      `${component} must not display ClientHub assets`,
    );
  }
});

test("decorative hero transforms cannot create horizontal page scrolling", () => {
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");
  const htmlRule = styles.match(/html\s*\{[\s\S]*?\}/)?.[0] ?? "";
  const bodyRule = styles.match(/body\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(htmlRule, /overflow-x:\s*clip/);
  assert.match(bodyRule, /overflow-x:\s*clip/);
});
