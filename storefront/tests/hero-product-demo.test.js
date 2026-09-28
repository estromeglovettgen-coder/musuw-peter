import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { HERO_STORY } from "../src/data/knowledgeStories.js";
import { DEMO_SOURCES } from "../src/data/demoSources.js";
import {
  HERO_DEMO_PHASES,
  HERO_DEMO_STAGE_DURATIONS,
  nextHeroDemoPhase,
  resolveHeroDemoPhase,
} from "../src/components/productDemoMotion.js";

const root = new URL("../", import.meta.url).pathname;

test("the hero keeps the localized in-view product walkthrough and existing shell", () => {
  const hero = readFileSync(join(root, "src/components/HeroScene.jsx"), "utf8");
  const demo = readFileSync(join(root, "src/components/HeroProductDemo.jsx"), "utf8");
  const authoritative = readFileSync(join(root, "src/components/AuthoritativeChatSurface.jsx"), "utf8");
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");
  assert.match(hero, /<HeroProductDemo locale=\{locale\}/);
  assert.doesNotMatch(hero, /<video/);
  assert.match(demo, /useInView/);
  assert.match(demo, /useReducedMotion/);
  assert.match(demo, /HERO_STORY/);
  assert.match(demo, /citation citation-kb hero-inline-citation/);
  assert.doesNotMatch(demo, /hero-demo-citations/);
  assert.match(demo, /data-demo-source-ref/);
  assert.match(demo, /HeroSaveDrawer/);
  assert.match(demo, /data-hero-save-drawer="true"/);
  assert.match(demo, /data-hero-save-publish="true"/);
  assert.match(demo, /data-hero-bookmark-action="true"/);
  assert.match(demo, /setting-drawer__header-block/);
  assert.match(demo, /manual-editor-footer-actions/);
  assert.match(demo, /data-demo-interactive="false"/);
  assert.match(demo, /\binert\b/);
  assert.doesNotMatch(demo, /DemoSourcePreview|onClick/);
  assert.match(demo, /visual-rag-pipeline__summary[\s\S]*aria-expanded="false"[\s\S]*disabled/);
  assert.doesNotMatch(demo, /Northstar Calibration|ORBITAL SAGE|28 feedback items/);
  assert.doesNotMatch(demo, /reasoning round\(s\)|tool call\(s\)/);
  assert.doesNotMatch(demo, /CheckCircle|Sparkle|\bariaHidden\b/);
  assert.match(demo, /return \(\) =>/);
  assert.match(styles, /\.hero-product-demo\s*\{/);
  assert.match(styles, /\.hero-demo-caret\s*\{/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(authoritative, /visual-chat-composer__combined-picker-agent/);
  assert.match(authoritative, /visual-chat-composer__combined-picker-model/);
  assert.match(authoritative, /visual-chat-composer__combined-picker-effort/);
  assert.match(authoritative, /visual-chat-composer__submit/);
  assert.match(authoritative, /overlay = null/);
});

test("hero answer follows native inline citations and the two-step knowledge save", () => {
  const demo = readFileSync(join(root, "src/components/HeroProductDemo.jsx"), "utf8");
  assert.match(demo, /className=\"citation citation-kb hero-inline-citation\"/);
  assert.match(demo, /citation-icon citation-icon--book/);
  assert.match(demo, /className=\"citation-text\"/);
  assert.match(demo, /className=\"citation-tip\"/);
  assert.match(demo, /tabIndex=\"0\"/);
  assert.doesNotMatch(demo, /hero-demo-citations/);
  assert.match(demo, /data-hero-save-action=\"true\"[\s\S]*data-hero-bookmark-action=\"true\"/);
  assert.match(demo, /data-hero-save-publish=\"true\"/);
  assert.match(demo, /data-hero-save-success=\"true\"/);
  assert.match(demo, /data-hero-save-step=\{saveStep\}/);
  assert.match(demo, /saveStep === \"publish\"/);
  assert.match(demo, /setSaveDrawerOpen\(true\)/);
  assert.match(demo, /setSavePublished\(true\)/);
  assert.match(demo, /知识标题/);
  assert.match(demo, /目标知识库/);
  assert.match(demo, /发布入库/);
  assert.match(demo, /知识已发布并开始索引/);
  assert.equal((demo.match(/visual-assistant-toolbar__button/g) || []).length, 3);
});

test("hero answer actions retain the native bot-message toolbar geometry", () => {
  const styles = readFileSync(join(root, "src/components/authoritative-chat-surface.css"), "utf8");
  assert.match(styles, /\.hero-demo-answer-actions\s*\{[\s\S]*?min-height:\s*28px;[\s\S]*?gap:\s*6px;/);
  assert.match(styles, /\.hero-demo-answer-actions\s+\.visual-assistant-toolbar__button\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?border:\s*0;[\s\S]*?padding:\s*4px;/);
  assert.match(styles, /\.hero-demo-answer-actions\s+\.visual-assistant-toolbar__button\s*>\s*svg\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;/);
});

test("the hero research fixture binds every citation to a reviewed source", () => {
  for (const locale of ["zh-CN", "en"]) {
    const story = HERO_STORY[locale];
    assert.equal(story.citations.length, 3);
    assert.equal(story.sourceIds.length, story.citations.length);
    assert.equal("disclaimer" in story, false);
    const sources = story.sourceIds.map((id) => DEMO_SOURCES[id]);
    assert.ok(sources.every((source) => source?.kind === "public" || source?.kind === "simulated"));
    assert.ok(sources.every((source) => source.locator && source.excerpt));
    assert.ok(sources.some((source) => source.kind === "public"));
  }
  assert.match(HERO_STORY["zh-CN"].question, /问题台账.*长期课题跟踪实验/);
  assert.match(HERO_STORY.en.question, /question ledger.*long-running research/i);
  assert.equal(HERO_STORY["zh-CN"].placeholder, "随心输入");
  assert.equal(HERO_STORY.en.placeholder, "Do anything");
});

test("hero turns a personal research ledger question into a multi-source, saved answer", () => {
  const story = HERO_STORY["zh-CN"];
  assert.match(story.question, /问题台账/);
  assert.match(story.question, /长期课题跟踪实验/);
  assert.ok(Array.isArray(story.answerSections));
  assert.deepEqual(story.answerSections.map(({ id }) => id), ["conclusion", "evidence", "impact", "trace"]);
  assert.ok(story.answerSections.find(({ id }) => id === "impact")?.table);
  assert.equal(story.sourceIds.length, 3);
  assert.equal(story.citations.length, story.sourceIds.length);
  assert.match(story.saveLabel, /存入知识复利/);
  assert.ok(story.answer.length > story.question.length * 3);

  assert.deepEqual(HERO_DEMO_PHASES, [
    "idle",
    "typing-question",
    "sending",
    "retrieving",
    "cross-checking",
    "drafting",
    "tracing",
    "answering",
    "saving",
    "complete",
  ]);
  assert.equal(nextHeroDemoPhase("typing-question"), "sending");
  assert.equal(nextHeroDemoPhase("tracing"), "answering");
  assert.equal(nextHeroDemoPhase("saving"), "complete");
  assert.equal(nextHeroDemoPhase("complete"), "complete");
  assert.equal(resolveHeroDemoPhase("retrieving", true), "complete");
  assert.ok(HERO_DEMO_STAGE_DURATIONS["cross-checking"] > HERO_DEMO_STAGE_DURATIONS.sending);
  assert.ok(HERO_DEMO_STAGE_DURATIONS.saving > 0);
});
