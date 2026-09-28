import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getStorefrontCopy } from "../src/i18n.js";
import { applyHomepageMarketingRefresh } from "../src/homepageMarketingRefresh.js";
import { KNOWLEDGE_STORIES, REASONING_STORY } from "../src/data/knowledgeStories.js";
import { DEMO_SOURCES } from "../src/data/demoSources.js";
import {
  LITTLE_PRINCE_GRAPH_TOTALS,
  LITTLE_PRINCE_GRAPH_VIEW,
  createLittlePrinceGraph,
} from "../src/data/littlePrinceGraph.js";
import {
  obsidianGraphProgressionItemCursor,
  obsidianGraphProgressionVisibleNodes,
  obsidianGraphProgressionCursor,
  obsidianGraphProgressionSpeed,
} from "../src/components/obsidian-graph/obsidianNativeGraphContract.ts";
import {
  CAPABILITY_DEMO_PHASES,
  CAPABILITY_DEMO_STAGE_DURATION,
  PRODUCT_DEMO_VIEWPORT_AMOUNT,
  WIKI_DEMO_STAGES,
  WIKI_STAGE_DURATIONS,
  nextCapabilityDemoPhase,
  nextWikiDemoStage,
  resolveWikiDemoStage,
} from "../src/components/productDemoMotion.js";

const root = new URL("../", import.meta.url).pathname;
let renderedFixture;
function renderFixture() {
  if (!renderedFixture) {
    renderedFixture = JSON.parse(execFileSync(process.execPath, [join(root, "tests/renderStorefrontFixture.mjs")], { cwd: root, encoding: "utf8" }));
  }
  return renderedFixture;
}
function section(markup, id, nextId) {
  const start = markup.indexOf(`id="${id}"`);
  const end = nextId ? markup.indexOf(`id="${nextId}"`, start) : markup.length;
  assert.notEqual(start, -1, `missing #${id}`);
  return markup.slice(start, end === -1 ? markup.length : end);
}

test("homepage capability areas use non-interactive product views where authenticity matters", () => {
  const { home } = renderFixture();
  for (const kind of ["reasoning", "wiki", "graph"]) assert.match(home, new RegExp(`data-capability-demo="${kind}"`));
  assert.match(home, /data-real-product-view="wiki"/);
  assert.match(home, /data-wiki-surface="true"/);
  assert.match(home, /data-wiki-sidebar="true"/);
  assert.match(home, /data-wiki-reader="true"/);
  assert.doesNotMatch(home, /src="\/images\/musuw-wiki-page\.jpg"/);
  assert.doesNotMatch(home, /<video\b|<canvas\b/);
  assert.match(home, /class="final-cta-visual" aria-hidden="true"/);
  assert.doesNotMatch(readFileSync(join(root, "index.html"), "utf8"), /rel="preload"[^>]+musuw-[a-z-]+\.jpg/);
  assert.ok(existsSync(join(root, "src/components/ProductCapabilityDemos.jsx")));
});

test("hero and chat demos share one authoritative chat surface while Wiki and Graph use the full product page", () => {
  const { home } = renderFixture();
  const platform = section(home, "platform", "pricing");
  assert.equal((home.match(/data-musuw-product-shell="true"/g) ?? []).length, 3);
  assert.equal((home.match(/data-authoritative-chat-surface="true"/g) ?? []).length, 3);
  assert.equal((home.match(/data-authoritative-chat-composer="true"/g) ?? []).length, 3);
  assert.equal((home.match(/data-product-page-shell=/g) ?? []).length, 2);
  assert.equal((platform.match(/data-platform-capability=/g) ?? []).length, 6);
  assert.match(platform, /class="benefit-grid platform-grid"/);
  assert.doesNotMatch(home, /capability-window-dots/);
  assert.doesNotMatch(home, /capability-demo-header|knowledge-loop-primary|knowledge-loop-rail/);
});

test("feature demos keep an alternating split while using one responsive horizontal media frame", () => {
  const css = readFileSync(join(root, "src/product-demos.css"), "utf8");
  assert.match(css, /--product-viewport-max-width:\s*1200px/);
  assert.match(css, /--product-viewport-aspect:\s*16\s*\/\s*10/);
  assert.match(css, /\.feature-visual\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*10;/);
  assert.match(css, /\.feature-visual\s*>\s*:is\(\.capability-demo,\s*\.kb-product-preview-viewport\)\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.feature-visual\s*>\s*\.capability-demo\.capability-demo-reasoning\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(css, /@media\s*\(min-width:\s*1081px\)[\s\S]*?\.feature-story\s*\{[\s\S]*?grid-template-columns:\s*minmax\(360px,\s*0\.72fr\)\s+minmax\(0,\s*1\.28fr\);/);
  assert.match(css, /@media\s*\(min-width:\s*1081px\)[\s\S]*?\.feature-story-reverse\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.28fr\)\s+minmax\(360px,\s*0\.72fr\);/);
  assert.match(css, /\.feature-story-reverse\s+\.feature-copy\s*\{[\s\S]*?order:\s*2;[\s\S]*?\}/);
  assert.match(css, /\.feature-story-reverse\s+\.feature-visual\s*\{[\s\S]*?order:\s*1;[\s\S]*?\}/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.feature-story,\s*\n\s*\.feature-story-reverse\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /\.hero-stage\s+\.dashboard-entry\s*\{[\s\S]*?aspect-ratio:\s*var\(--product-viewport-aspect\);/);
});

test("final CTA uses an empty native Musuw new-chat surface", () => {
  const { home, chineseHome } = renderFixture();
  const source = readFileSync(join(root, "src/components/ProductCapabilityDemos.jsx"), "utf8");
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");
  const finalCta = home.slice(home.indexOf('<section class="final-cta">'));

  for (const token of [
    "AuthoritativeChatSurface",
    "AuthoritativeChatComposer",
    "FinalCtaProductDemo",
    "data-story=\"new-chat\"",
    "newChat",
    "GPT-6 Astra",
  ]) assert.match(source, new RegExp(token));

  assert.match(source, /data-demo-interactive="false"/);
  assert.match(source, /\binert\b/);
  assert.doesNotMatch(source, /product-demo-query|answer-demo-thread|DemoComposer/);
  assert.match(finalCta, /data-story="new-chat"/);
  assert.match(finalCta, />Hi, I’m Musuw</);
  assert.match(finalCta, /GPT-6 Astra/);
  assert.match(finalCta, /Build my knowledge base/);
  assert.doesNotMatch(finalCta, /data-capability-demo="answer"|Conclusion|Verification boundary|Interviews/);
  assert.match(chineseHome, />Hi，我是 Musuw</);
  assert.match(chineseHome, /建立我的知识库/);
  assert.match(styles, /\.final-cta-dashboard-frame \.final-cta-product-demo \.visual-new-chat-stack\s*\{[^}]*width:\s*min\(360px,\s*calc\(100% - 40px\)\)/s);
  assert.match(styles, /\.final-cta-dashboard-frame \.final-cta-product-demo \.visual-new-chat-composer\s*\{[^}]*bottom:\s*20px/s);
});

test("wiki renders a real product surface and graph retains its product surface", () => {
  const { chineseHome } = renderFixture();
  const previewSource = readFileSync(join(root, "src/components/KnowledgeBaseProductPreview.jsx"), "utf8");
  assert.match(chineseHome, /data-product-page-shell="wiki"/);
  assert.match(chineseHome, /data-product-page-shell="graph"/);
  for (const tab of ["documents", "wiki", "graph"]) assert.equal((chineseHome.match(new RegExp(`data-kb-tab="${tab}"`, "g")) ?? []).length, 2);
  assert.match(chineseHome, /data-real-product-view="wiki"/);
  assert.match(chineseHome, /data-wiki-demo-link="index"/);
  assert.match(chineseHome, /data-wiki-page-id="index"/);
  assert.doesNotMatch(chineseHome, /data-wiki-demo-link="sidebar(?:-fallback)?"/);
  assert.match(chineseHome, /data-wiki-index-link="summary"[\s\S]*href="#memory-evaluation"/);
  assert.doesNotMatch(chineseHome, /href="#evaluation-tasks"/);
  assert.equal((chineseHome.match(/visual-sidebar kb-preview-app-sidebar/g) ?? []).length, 2);
  assert.equal((chineseHome.match(/data-product-app-sidebar-state="collapsed"/g) ?? []).length, 5);
  assert.doesNotMatch(chineseHome, /data-product-app-sidebar-state="expanded"/);
  assert.equal((chineseHome.match(/visual-knowledge-page kb-preview-knowledge-page/g) ?? []).length, 2);
  assert.equal((chineseHome.match(/wiki-browser kb-preview-wiki-browser/g) ?? []).length, 2);
  assert.match(chineseHome, /data-wiki-sidebar="true"/);
  assert.match(chineseHome, /data-wiki-reader="true"/);
  for (const classPair of ["wiki-graph kb-preview-graph", "wiki-graph-canvas kb-preview-graph-canvas"]) assert.ok(chineseHome.includes(classPair));
  assert.match(chineseHome, /搜索整张知识图谱\.\.\./);
  assert.match(chineseHome, /《小王子》阅读笔记/);
  assert.doesNotMatch(previewSource, /DemoSourcePreview|DemoPointer|createPortal|onSource/);
  assert.doesNotMatch(chineseHome, /data-demo-source=/);
  assert.match(chineseHome, /data-demo-interactive="false"/);
  assert.match(chineseHome, /inert=""/);
  assert.doesNotMatch(previewSource, /Listmonk|暴利程度|长期躺赚/);
  assert.equal((chineseHome.match(/data-graph-legend-type=/g) ?? []).length, 7);
  assert.match(chineseHome, /class="obsidian-graph-canvas"/);
  assert.match(chineseHome, /data-playback-state="idle"/);
  assert.match(chineseHome, new RegExp(`data-playback-total="${LITTLE_PRINCE_GRAPH_TOTALS.nodes}"`));
  assert.match(chineseHome, new RegExp(`${LITTLE_PRINCE_GRAPH_TOTALS.nodes} \/ ${LITTLE_PRINCE_GRAPH_TOTALS.nodes} 个节点`));
  assert.match(chineseHome, new RegExp(`data-graph-node-count="${LITTLE_PRINCE_GRAPH_TOTALS.nodes}"`));
  assert.match(chineseHome, new RegExp(`data-graph-camera-scale="${LITTLE_PRINCE_GRAPH_VIEW.initialScale}"`));
  assert.doesNotMatch(chineseHome, /data-graph-visual-scale|--graph-canvas-width/);
  assert.doesNotMatch(chineseHome, /data-graph-action="fit-view"|data-graph-action="toggle-arrows"|data-graph-settings="true"/);
  assert.match(previewSource, /getBoundingClientRect/);
  assert.match(chineseHome, /data-wiki-camera-scale="1"/);
  assert.doesNotMatch(previewSource, /data-wiki-camera-world/);
  assert.doesNotMatch(chineseHome, /wiki-demo-body|graph-demo-toolbar/);
  assert.doesNotMatch(chineseHome, /MAX_FIXED_OK|FREE_FIXED_OK|RESTORED_MAX_OK|FREE_OK|PRO_OK|demo@musuw\.com/);
});

test("essential homepage content is visible in server HTML before observers or timers run", () => {
  const { home } = renderFixture();
  const features = section(home, "feature", "platform");
  const platform = section(home, "platform", "pricing");
  assert.doesNotMatch(features, /opacity:0/);
  assert.doesNotMatch(platform, /opacity:0/);
  assert.match(platform, /A complete workflow from sources to knowledge/);
  assert.equal((platform.match(/data-platform-capability=/g) ?? []).length, 6);
});

test("homepage headings keep the approved Hero and updated closing module", () => {
  const en = applyHomepageMarketingRefresh(getStorefrontCopy("en"));
  const zh = applyHomepageMarketingRefresh(getStorefrontCopy("zh-CN"));
  const headings = (copy) => [copy.hero.titleLine1, copy.hero.titleLine2, copy.features.intro.title, copy.platform.intro.title, copy.pricing.intro.title, copy.comparison.title, copy.faq.title, copy.finalCta.title];
  assert.deepEqual(headings(en), ["Build your AI knowledge base", "Let knowledge keep growing", "Build a verifiable knowledge system that keeps evolving", "A complete workflow from sources to knowledge", "Plans & Pricing", "Plans and features", "Questions before you start", "Build your AI knowledge base\nKeep your knowledge growing"]);
  assert.deepEqual(headings(zh), ["建立你的AI知识库", "让知识持续积累", "构建可验证、可持续演进的知识体系", "覆盖从资料到知识的完整链路", "方案与定价", "方案与功能", "开始前的常见问题", "建立你的 AI 知识库\n让知识持续积累"]);
  assert.deepEqual([zh.features.items[0].title, zh.features.items[3].title, zh.features.items[2].title], ["以多源证据支撑判断", "让知识以结构持续演进", "让关系成为可探索的知识路径"]);
});

test("product demos start only when half visible, end once, and reset after leaving", () => {
  const motion = readFileSync(join(root, "src/components/productDemoMotion.js"), "utf8");
  const chat = readFileSync(join(root, "src/components/RealChatCapabilityDemo.jsx"), "utf8");
  const graph = readFileSync(join(root, "src/components/ProductCapabilityDemos.jsx"), "utf8");
  const primitives = readFileSync(join(root, "src/components/MotionPrimitives.jsx"), "utf8");

  assert.equal(PRODUCT_DEMO_VIEWPORT_AMOUNT, 0.5);
  assert.deepEqual(CAPABILITY_DEMO_PHASES, ["capture", "reason", "connect", "complete"]);
  assert.equal(nextCapabilityDemoPhase("capture"), "reason");
  assert.equal(nextCapabilityDemoPhase("connect"), "complete");
  assert.equal(nextCapabilityDemoPhase("complete"), "complete");
  assert.equal(CAPABILITY_DEMO_STAGE_DURATION, 1_500);
  assert.doesNotMatch(motion, /setInterval/);
  assert.match(motion, /if \(!inView\) \{\s*setPhase\("capture"\)/);
  assert.match(motion, /if \(!inView\) \{\s*setStage\("page"\)/);
  assert.match(chat, /amount:\s*0\.5/);
  assert.doesNotMatch(chat, /later\(\(\) => runTurn\(\),\s*8500\)/);
  assert.match(graph, /key=\{resetKey\}/);
  assert.match(graph, /wasInViewRef/);
  assert.match(graph, /className="capability-demo-replay-boundary" ref=\{ref\}/);
  assert.match(graph, /graphAutoPlay=\{inView && reducedMotion !== true\}/);
  assert.doesNotMatch(primitives, /once:\s*true/);
  assert.match(primitives, /useReplayableInView/);

  const platform = readFileSync(join(root, "src/components/HomeRefreshSections.jsx"), "utf8");
  assert.doesNotMatch(platform, /StaggerGroup|amount=\{0\.12\}/);
  assert.match(platform, /data-platform-capability=\{index \+ 1\}[\s\S]*?amount=\{0\.5\}/);
});

test("visible Chinese marketing chrome avoids technical feature jargon", () => {
  const zh = applyHomepageMarketingRefresh(getStorefrontCopy("zh-CN"));
  const copy = JSON.stringify({ hero: zh.hero, features: zh.features, platform: zh.platform, faq: zh.faq });
  assert.match(copy, /智能体/);
  assert.doesNotMatch(copy, /(?:^|[^A-Za-z])Agent(?:[^A-Za-z]|$)/);
  assert.doesNotMatch(copy, /工具自主编排|实体关系提取|找不到已有内容/);
  assert.doesNotMatch(copy, /从自己的资料中|参与每一次思考|用户访谈|客服反馈|使用数据|人物|情节|章节|阅读笔记|研究问题/);
  assert.match(copy, /多源检索|证据核验|知识组织|关系发现/);
});

test("the three independent scenes have research, reading and work-specific fixtures", () => {
  for (const lang of ["zh", "en"]) {
    const { wiki, graph } = KNOWLEDGE_STORIES[lang];
    assert.equal(wiki.content.sourceIds.length, 3);
    assert.equal(wiki.content.linkedPage.pageTitle.toLocaleLowerCase(), wiki.content.inlineLink.toLocaleLowerCase());
    assert.equal(wiki.content.linkedPage.sourceIds.length, 3);
    assert.equal(wiki.content.indexType, lang === "zh" ? "目录" : "Directory");
    assert.equal(wiki.content.index, lang === "zh" ? "索引" : "Index");
    assert.equal(createLittlePrinceGraph(lang).meta.chapterCount, 27);
    assert.match(graph.content.status, lang === "zh" ? /全书/ : /complete book/i);
    assert.equal(REASONING_STORY[lang].steps.length, 5);
    assert.equal(REASONING_STORY[lang].sourceIds.length, 3);
    assert.equal("disclaimer" in REASONING_STORY[lang], false);
    assert.notEqual(wiki.header.current, graph.header.current);
  }
  assert.match(REASONING_STORY.zh.steps.map(({ title }) => title).join(" "), /BM25.*向量.*Rerank.*证据核验/);
});

test("the knowledge answer is a reviewable decision brief backed by every cited source", () => {
  const expectedSections = ["conclusion", "evidence", "alternative", "validation", "limits"];

  for (const lang of ["zh", "en"]) {
    const story = REASONING_STORY[lang];
    assert.deepEqual(story.answerSections.map(({ id }) => id), expectedSections);
    assert.ok(story.answerSections.every(({ title }) => title.trim().length > 0));

    const evidence = story.answerSections.find(({ id }) => id === "evidence");
    assert.deepEqual(evidence.items.map(({ sourceId }) => sourceId), story.sourceIds);
    assert.ok(evidence.items.every(({ sourceId, text }) => DEMO_SOURCES[sourceId] && text.trim().length > 0));

    const validation = story.answerSections.find(({ id }) => id === "validation");
    assert.ok(validation.items.length >= 3);
    assert.ok(story.answer.length > story.question.length * 3);
  }

  assert.match(REASONING_STORY.zh.answer, /优先判断.*证据交叉验证.*备选假设.*验证方案.*判断边界/s);
  assert.match(REASONING_STORY.en.answer, /Priority conclusion.*Evidence review.*Alternative hypothesis.*Validation plan.*Decision limits/s);
});

test("Wiki demo follows two fixed-camera link navigations and stops on the destination page", () => {
  assert.deepEqual(WIKI_DEMO_STAGES, [
    "page",
    "moving-to-index-link",
    "pressing-index-link",
    "section-page",
    "moving-to-inline-link",
    "pressing-inline-link",
    "linked-page",
  ]);
  assert.equal(nextWikiDemoStage("page"), "moving-to-index-link");
  assert.equal(nextWikiDemoStage("moving-to-index-link"), "pressing-index-link");
  assert.equal(nextWikiDemoStage("pressing-index-link"), "section-page");
  assert.equal(nextWikiDemoStage("section-page"), "moving-to-inline-link");
  assert.equal(nextWikiDemoStage("moving-to-inline-link"), "pressing-inline-link");
  assert.equal(nextWikiDemoStage("pressing-inline-link"), "linked-page");
  assert.equal(nextWikiDemoStage("linked-page"), "linked-page");
  assert.equal(nextWikiDemoStage("unknown"), "page");
  assert.equal(resolveWikiDemoStage("moving-to-inline-link", false), "moving-to-inline-link");
  assert.equal(resolveWikiDemoStage("moving-to-inline-link", true), "page");
  assert.ok(WIKI_STAGE_DURATIONS.page > 0);
  assert.ok(WIKI_STAGE_DURATIONS["moving-to-index-link"] > WIKI_STAGE_DURATIONS["pressing-index-link"]);
  assert.ok(WIKI_STAGE_DURATIONS["moving-to-inline-link"] > WIKI_STAGE_DURATIONS["pressing-inline-link"]);
});

test("showcase surfaces cannot be clicked or focused and the legal footer is removed", () => {
  const { chineseHome, home } = renderFixture();
  const hero = readFileSync(join(root, "src/components/HeroProductDemo.jsx"), "utf8");
  const chat = readFileSync(join(root, "src/components/RealChatCapabilityDemo.jsx"), "utf8");
  const source = readFileSync(join(root, "src/components/ProductCapabilityDemos.jsx"), "utf8");
  const preview = readFileSync(join(root, "src/components/KnowledgeBaseProductPreview.jsx"), "utf8");
  const styles = readFileSync(join(root, "src/product-demos.css"), "utf8");
  for (const component of [hero, chat, source, preview]) assert.match(component, /data-demo-interactive="false"/);
  assert.match(styles, /\[data-demo-interactive="false"\][^{]*\{[^}]*pointer-events:\s*none/s);
  assert.doesNotMatch(`${chineseHome}\n${home}\n${hero}`, /中国大陆法律信息示例|不替代个案法律意见|UK legal-information example/);
  assert.doesNotMatch(`${chineseHome}\n${home}`, /在线学习产品示例|模拟研究资料|中国大陆示例|Example learning product|Simulated research|UK example/);
});

test("every marketing chat composer uses the same concise Codex invitation", () => {
  const source = readFileSync(join(root, "src/components/ProductCapabilityDemos.jsx"), "utf8");
  assert.equal((source.match(/placeholder: \"随心输入\"/g) || []).length, 2);
  assert.equal((source.match(/placeholder: \"Do anything\"/g) || []).length, 2);
  assert.doesNotMatch(source, /基于你的知识提问|Ask across your knowledge/);
  assert.equal(REASONING_STORY.zh.placeholder, "随心输入");
  assert.equal(REASONING_STORY.en.placeholder, "Do anything");
});

test("capability demos use production-visible states and the unchanged native Obsidian renderer", () => {
  assert.equal(obsidianGraphProgressionSpeed(48), 5);
  assert.equal(obsidianGraphProgressionCursor(0, 14, 48), 1);
  assert.equal(obsidianGraphProgressionCursor(1_000, 14, 48), 6);
  assert.equal(obsidianGraphProgressionCursor(2_600, 14, 48), 14);
  const progressionItems = LITTLE_PRINCE_GRAPH_TOTALS.nodes + LITTLE_PRINCE_GRAPH_TOTALS.links;
  assert.equal(progressionItems, 1_125);
  const nativeSpeed = obsidianGraphProgressionSpeed(progressionItems);
  assert.ok(nativeSpeed > 16 && nativeSpeed < 17);
  assert.equal(obsidianGraphProgressionItemCursor(0, progressionItems), 1);
  assert.equal(obsidianGraphProgressionVisibleNodes(28, [1, 29, 39]), 1);
  const seedDuration = (297 / nativeSpeed / LITTLE_PRINCE_GRAPH_VIEW.progressionTimeScale) * 1_000;
  assert.ok(seedDuration >= 8_000 && seedDuration <= 10_000);
  assert.ok(LITTLE_PRINCE_GRAPH_VIEW.progressionMaxTimeScale > LITTLE_PRINCE_GRAPH_VIEW.progressionTimeScale);
  const source = readFileSync(join(root, "src/components/ProductCapabilityDemos.jsx"), "utf8");
  const chat = readFileSync(join(root, "src/components/RealChatCapabilityDemo.jsx"), "utf8");
  const hero = readFileSync(join(root, "src/components/HeroProductDemo.jsx"), "utf8");
  const authoritativeChat = readFileSync(join(root, "src/components/AuthoritativeChatSurface.jsx"), "utf8");
  const authoritativeChatStyles = readFileSync(join(root, "src/components/authoritative-chat-surface.css"), "utf8");
  const motion = readFileSync(join(root, "src/components/productDemoMotion.js"), "utf8");
  const preview = readFileSync(join(root, "src/components/KnowledgeBaseProductPreview.jsx"), "utf8");
  const graphCanvas = readFileSync(join(root, "src/components/ObsidianGraphCanvas.jsx"), "utf8");
  const renderer = readFileSync(join(root, "src/components/obsidian-graph/obsidianWikiGraphRenderer.ts"), "utf8");
  const styles = readFileSync(join(root, "src/product-demos.css"), "utf8");
  assert.match(chat, /"idle",\s*"typing",\s*"sent",\s*"searching",\s*"scoping",\s*"comparing",\s*"drafting",\s*"validating",\s*"answering",\s*"complete"/);
  for (const demo of [hero, chat]) {
    assert.match(demo, /AuthoritativeChatSurface/);
    assert.match(demo, /AuthoritativeChatComposer/);
  }
  assert.match(authoritativeChat, /visual-chat-composer/);
  assert.match(authoritativeChatStyles, /width:\s*min\(768px,\s*calc\(100% - 32px\)\)/);
  assert.doesNotMatch(authoritativeChatStyles, /transform:\s*scale/);
  assert.doesNotMatch(`${hero}\n${chat}\n${authoritativeChat}`, /suggestedQuestions|visual-chat-suggestions|\u4f60\u53ef\u4ee5\u8fd9\u6837\u95ee\u6211/);
  assert.match(chat, /visual-rag-pipeline/);
  assert.match(chat, /visual-assistant-message/);
  assert.match(motion, /"page",\s*"moving-to-index-link",\s*"pressing-index-link",\s*"section-page",\s*"moving-to-inline-link",\s*"pressing-inline-link",\s*"linked-page"/);
  assert.doesNotMatch(motion, /restore|%\s*WIKI_DEMO_STAGES\.length/);
  assert.doesNotMatch(motion, /focus-source|paused|pause|resume/);
  assert.match(source, /useWikiDemoFlow/);
  assert.match(motion, /useReducedMotion/);
  // Keep the observer on a stable wrapper: leaving view re-creates the graph
  // renderer, and a subsequent entry starts its one-shot progression again.
  assert.match(source, /className="capability-demo-replay-boundary" ref=\{ref\}/);
  assert.match(source, /key=\{resetKey\}/);
  assert.match(source, /graphAutoPlay=\{inView && reducedMotion !== true\}/);
  assert.doesNotMatch(preview, /data-wiki-reveal-step|DemoSourcePreview|DemoPointer|createPortal/);
  assert.match(preview, /function WikiProductSurface/);
  assert.match(preview, /data-wiki-demo-link/);
  assert.match(preview, /data-wiki-auto-pointer/);
  assert.match(preview, /linkedPage/);
  assert.doesNotMatch(preview, /\/images\/musuw-wiki-page\.jpg/);
  assert.doesNotMatch(preview, /computeCoordinateTargetZoom|data-wiki-camera-world|WIKI_CAMERA_TRANSITION/);
  assert.match(preview, /data-wiki-camera-scale="1"/);
  assert.match(preview, /<ObsidianGraphCanvas/);
  assert.doesNotMatch(preview, /setInterval|canvasRef\.current\?\.replay/);
  assert.match(preview, /progressionTimeScale=\{LITTLE_PRINCE_GRAPH_VIEW\.progressionTimeScale\}/);
  assert.match(preview, /setProgressionTimeScale\(growthTimeScale\)/);
  assert.match(preview, /fit\(\{\s*visibleOnly: true,/s);
  assert.match(preview, /maxScale:\s*growthFitActiveRef\.current/);
  assert.match(preview, /growthScaleCapRef\.current/);
  assert.doesNotMatch(preview, /focusNode\(GRAPH_FOCUS_SLUG/);
  assert.match(preview, /nodeSlugs:\s*focusNodeSlugs/);
  assert.match(preview, /getNodeViewportPoint\(focusSlug/);
  assert.match(preview, /setHoveredNode\(GRAPH_FOCUS_SLUG/);
  assert.match(preview, /<GraphNodeDetailDrawer/);
  assert.match(graphCanvas, /new ObsidianWikiGraphRenderer\(container\)/);
  assert.match(graphCanvas, /renderer\.startProgression/);
  assert.doesNotMatch(graphCanvas, /setInterval|replayTimer/);
  assert.match(renderer, /new Application\(/);
  assert.match(renderer, /OBSIDIAN_GRAPH_WORKER_PATH/);
  assert.match(renderer, /attributeFilter:\s*\['theme-mode',\s*'class',\s*'data-theme'\]/);
  assert.ok(existsSync(join(root, "public/vendor/obsidian-1.13.7/graph-sim.js")));
  assert.doesNotMatch(source, /initial=\{[^}]*opacity:\s*0/);
  assert.doesNotMatch(preview, /data-graph-node=/);
  assert.doesNotMatch(styles, /kb-preview-node-arrival|kb-preview-graph-nodes g\.is-visible/);
  assert.doesNotMatch(styles, /grayscale\(1\)/);
  assert.match(styles, /\.kb-product-preview-graph\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0/s);
  assert.match(styles, /\.kb-preview-graph-canvas\s*\{[^}]*inset:\s*0[^}]*width:\s*100%[^}]*height:\s*100%[^}]*transform:\s*none/s);
  assert.doesNotMatch(styles, /--graph-canvas-width|width:\s*var\(--graph-canvas-width/);
  assert.doesNotMatch(styles, /width:\s*200%/);
  assert.match(styles, /\.musuw-product-shell\s*\{[\s\S]*?grid-template-columns:\s*56px minmax\(0, 1fr\)/);
  assert.match(styles, /\.kb-product-preview\.is-graph\s*\{[^}]*grid-template-columns:\s*56px minmax\(0, 1fr\)/s);
  assert.doesNotMatch(styles, /\.kb-preview-graph-pointer\s*\{[^}]*top:\s*50%[^}]*left:\s*50%/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none !important/);
});

test("the storefront graph engine stays byte-for-byte aligned with production", () => {
  for (const file of ["obsidianWikiGraphRenderer.ts", "obsidianGraphSettings.ts", "obsidianGraphWorkerProtocol.ts", "obsidianForce.worker.ts", "weknoraGraphTheme.ts"]) {
    assert.equal(readFileSync(join(root, "src/components/obsidian-graph", file), "utf8"), readFileSync(join(root, "../weknora/frontend/src/views/knowledge/wiki/graph", file), "utf8"), `${file} must remain a mechanical copy`);
  }
  assert.deepEqual(readFileSync(join(root, "public/vendor/obsidian-1.13.7/graph-sim.js")), readFileSync(join(root, "../weknora/frontend/public/vendor/obsidian-1.13.7/graph-sim.js")));
});
