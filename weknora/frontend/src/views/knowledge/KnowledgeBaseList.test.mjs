import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./KnowledgeBaseList.vue", import.meta.url), "utf8");
const controller = readFileSync(
  new URL("../../assets/business-baselines/KnowledgeBaseList.pre-view.vue", import.meta.url),
  "utf8",
);

test("consumer KB creation opens the zero-config document flow without model preselection", () => {
  assert.match(
    controller,
    /const handleCreateKnowledgeBase = \(\) => \{[\s\S]*?uiStore\.openCreateKB\('document'\)/,
  );
  assert.doesNotMatch(controller, /useTenantModelReadiness|modelsReadyLoaded|isReadyForDocumentKb/);
});

test("consumer KB list has no uninitialized-model repair prompt or settings escape hatch", () => {
  assert.doesNotMatch(controller, /hasUninitializedKbs|uninitializedBanner|isInitialized\(/);
  assert.match(
    controller,
    /const handleCardClick = \(kb: KB\) => \{[\s\S]*?pins\.touchRecent\('kb', kb\.id\)[\s\S]*?goDetail\(kb\.id\)/,
  );
  const openCardPath = controller.match(
    /const handleCardClick = \(kb: KB\) => \{[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.doesNotMatch(openCardPath, /settings|readiness|initialized/i);
});

test("non-empty KB grids keep the single header creation action while preserving native scopes", () => {
  assert.doesNotMatch(source, /class="header-action-btn"/);
  assert.match(source, /class="visual-kb-list__create"[\s\S]*?data-guide="kb-list-create"/);
  assert.doesNotMatch(source, /visual-kb-list__create-card/);
  assert.match(source, /class="visual-kb-empty"[\s\S]*?class="empty-state-btn"[^>]*data-guide="kb-list-create"/);
  assert.match(source, /class="visual-kb-section"/);
});

test("KB cards do not render decorative graph or multimodal footer badges", () => {
  assert.doesNotMatch(source, /class="feature-badge kg"/);
  assert.doesNotMatch(source, /class="feature-badge multimodal"/);
});
