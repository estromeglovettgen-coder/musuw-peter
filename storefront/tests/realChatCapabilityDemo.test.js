import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const storefrontRoot = new URL("../", import.meta.url).pathname;
const productionRoot = join(storefrontRoot, "../weknora/frontend/src/views/chat");

const readProduction = (relativePath) => {
  const path = join(productionRoot, relativePath);
  assert.ok(existsSync(path), `production source is missing: ${path}`);
  return readFileSync(path, "utf8");
};

test("Demo 1 keeps the production chat DOM seam and event order", () => {
  const demo = readFileSync(join(storefrontRoot, "src/components/RealChatCapabilityDemo.jsx"), "utf8");
  const chatView = readProduction("index.vue");
  const userMessage = readProduction("components/usermsg.vue");
  const botMessage = readProduction("components/botmsg.vue");
  const ragPipeline = readProduction("components/RagPipelineProgress.vue");

  // These are the classes that users actually see in the native chat. Keep
  // the fixture on the same DOM seam so only data and timing differ.
  for (const token of [
    "visual-chat-message-row",
    "visual-user-message",
    "visual-user-message__bubble",
    "visual-assistant-message",
    "visual-assistant-message__context",
    "visual-assistant-pipeline",
    "visual-assistant-answer",
    "visual-assistant-answer__content",
    "visual-assistant-markdown",
    "visual-assistant-toolbar",
    "visual-assistant-toolbar__button",
    "visual-rag-pipeline",
    "visual-rag-timeline",
    "visual-rag-step",
    "visual-rag-pipeline__summary",
  ]) {
    assert.match(chatView + userMessage + botMessage + ragPipeline, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing native token ${token}`);
    assert.match(demo, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Demo 1 dropped native token ${token}`);
  }

  assert.match(demo, /showPrePipelineWait/);
  assert.match(demo, /showModelWait/);
  assert.match(demo, /showCollapsedRoot/);
  assert.match(demo, /data-rag-pipeline-summary="complete"/);
  assert.match(demo, /"idle",\s*"typing",\s*"sent",\s*"searching",\s*"scoping",\s*"comparing",\s*"drafting",\s*"validating",\s*"answering",\s*"complete"/);
  assert.match(demo, /AuthoritativeChatComposer/);
  assert.match(demo, /messagesRef=\{messagesRef\}/);
  assert.match(demo, /data-demo-interactive="false"/);
  assert.match(demo, /\binert\b/);
});

test("Demo 1's scoped CSS uses the native chat geometry instead of a miniature layout", () => {
  const css = readFileSync(join(storefrontRoot, "src/real-chat-demo.css"), "utf8");
  const productionChat = readProduction("index.vue");
  const productionUser = readProduction("components/usermsg.vue");
  const productionBot = readProduction("components/botmsg.vue");
  const productionRag = readProduction("components/RagPipelineProgress.vue");

  for (const declaration of [
    "contain: layout style",
    "padding: 10px 18px",
    "font-size: 14.5px",
    "line-height: 1.625",
    "gap: 14px",
    "margin: 10px 0 8px",
    "min-height: 28px",
  ]) {
    assert.match(productionChat + productionUser + productionBot + productionRag, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `production contract changed: ${declaration}`);
    assert.match(css, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Demo 1 geometry drifted: ${declaration}`);
  }

  assert.doesNotMatch(css, /\.real-chat-demo__messages\s*\{[\s\S]*?position:\s*absolute/);
  assert.doesNotMatch(css, /\.real-chat-input\s*\{/);
});
