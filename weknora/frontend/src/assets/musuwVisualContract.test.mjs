import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const theme = read("./theme/theme.css");
const visual = read("./musuw-visual.less");
const main = read("../main.ts");
const useTheme = read("../composables/useTheme.ts");
const sidebar = read("../components/menu.vue");
const platform = read("../views/platform/index.vue");
const knowledgeBase = read("../views/knowledge/KnowledgeBase.vue");
const wikiBrowser = read("../views/knowledge/wiki/WikiBrowser.vue");
const overlayBridge = read("./musuw-tdesign-overlay-bridge.css");
const preferenceCompat = read("./musuw-visual-preference-compat.css");
const finalClosure = read("./musuw-final-contract-closure.css");
const finalTheme = read("./musuw-final-theme-closure.css");

test("uses the reference Musuw typefaces and cool-neutral visual tokens", () => {
  assert.match(main, /@fontsource-variable\/inter/);
  assert.match(main, /@fontsource-variable\/jetbrains-mono/);
  assert.match(main, /@fontsource-variable\/noto-sans-sc/);
  assert.match(theme, /--musuw-ink:\s*#1f2937/);
  assert.match(theme, /--musuw-muted:\s*#6b7280/);
  assert.match(theme, /--musuw-line:\s*#e5e7eb/);
  assert.match(theme, /--musuw-line-strong:\s*#d1d5db/);
  assert.match(theme, /--musuw-accent:\s*#2563eb/);
  assert.match(theme, /--musuw-space-unit:\s*8px/);
  assert.match(theme, /--musuw-radius-control:\s*8px/);
  assert.match(theme, /--musuw-radius-card:\s*12px/);
  assert.match(theme, /:root\[theme-mode="dark"\]\s*\{\s*color-scheme:\s*dark/);
});

test("keeps graph behavior isolated while sharing native select chrome", () => {
  const bareRootBlocks = [
    ...theme.matchAll(/(?:^|\n):root(?:,\s*:root\[theme-mode="light"\])?\s*\{([\s\S]*?)\}/g),
    ...theme.matchAll(/(?:^|\n):root\[theme-mode="dark"\]\s*\{([\s\S]*?)\}/g),
  ];
  assert.ok(bareRootBlocks.length >= 2, "light and dark semantic roots must exist");
  for (const block of bareRootBlocks) {
    assert.doesNotMatch(block[1], /--td-/, "bare :root must not override TDesign tokens");
  }
  assert.match(platform, /class="main musuw-workspace-surface"/);
  assert.match(theme, /\.musuw-workspace-surface:not\(:has\(\.visual-knowledge-page\.is-graph-tab\)\)/);
  assert.match(knowledgeBase, /'is-graph-tab':\s*activeKbTab\s*===\s*'graph'/);
  assert.match(wikiBrowser, /overlayClassName:\s*'wiki-graph-search-dropdown'/);
  assert.match(wikiBrowser, /drawer-class-name="wiki-graph-drawer"/);
  assert.match(overlayBridge, /body \.t-select__dropdown:not\(\.org-select-dropdown-popup\)/);
  assert.match(overlayBridge, /not\(\.sandbox-backend-popup\)/);
  assert.doesNotMatch(preferenceCompat, /body \.t-popconfirm/);
  assert.doesNotMatch(finalTheme, /body \.t-popconfirm/);
  assert.doesNotMatch(finalClosure, /(?:^|\n)\.wiki-graph/m);
});

test("uses one ordered presentation entry instead of direct patch-layer imports", () => {
  assert.match(main, /import "@\/assets\/musuw-visual\.less"/);
  for (const layer of [
    "theme/theme.css",
    "musuw-ui-primitives.css",
    "musuw-visual-contract-final.css",
    "musuw-final-theme-closure.css",
  ]) {
    assert.equal(main.includes(layer), false, `${layer} must not bypass the visual entry`);
    assert.ok(visual.includes(`"./${layer}"`), `visual entry lost ${layer}`);
  }
});

test("lets CSS own the web canvas instead of a theme startup inline style", () => {
  assert.doesNotMatch(useTheme, /document\.documentElement\.style\.background/);
  assert.doesNotMatch(useTheme, /document\.body\.style\.background/);
  assert.doesNotMatch(useTheme, /getElementById\(['"]app['"]\)/);
  assert.match(useTheme, /WindowSetBackgroundColour\(251, 252, 254, 255\)/);
  assert.match(useTheme, /WindowSetBackgroundColour\(21, 22, 25, 255\)/);
});

test("keeps the complete Musuw logo without a duplicate sidebar wordmark", () => {
  assert.match(sidebar, /class="visual-sidebar__brand"/);
  assert.match(sidebar, /class="visual-sidebar__mark"[\s\S]*<img src="\/musuw-logo\.png"/);
  assert.doesNotMatch(sidebar, />Musuw 穆苏瓦</);
});
