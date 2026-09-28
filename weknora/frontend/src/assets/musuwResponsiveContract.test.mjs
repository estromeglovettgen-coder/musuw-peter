import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const menu = read("../components/menu.vue");
const menuBusiness = read("./business-baselines/menu.pre-view.vue");
const input = read("../components/Input-field.vue");
const knowledgeBaseList = read("../views/knowledge/KnowledgeBaseList.vue");

test("create knowledge-base action stays a single responsive header CTA", () => {
  assert.match(knowledgeBaseList, /class="visual-kb-list__create"[^>]*@click="handleCreateKnowledgeBase"/);
  assert.doesNotMatch(knowledgeBaseList, /visual-kb-list__create-card/);
  assert.match(knowledgeBaseList, /\.visual-kb-list__create\s*\{[^}]*display:\s*inline-flex[^}]*white-space:\s*nowrap/i);
  assert.ok(knowledgeBaseList.includes(':deep(.visual-kb-grid) { grid-template-columns: repeat(2,minmax(0,1fr)); }'));
  assert.ok(knowledgeBaseList.includes(':deep(.visual-kb-grid) { grid-template-columns: repeat(3,minmax(0,1fr)); }'));
});

test("sidebar enters narrow view collapsed without rewriting desktop preference", () => {
  assert.match(menuBusiness, /const\s+SIDEBAR_NARROW_BREAKPOINT\s*=\s*760/);
  assert.match(menuBusiness, /uiStore\.sidebarCollapsed\s*=\s*true/);
  assert.match(
    menuBusiness,
    /const\s+toggleSidebar\s*=\s*\(\)\s*=>\s*\{[\s\S]*?sidebarWasNarrow[\s\S]*?uiStore\.sidebarCollapsed\s*=\s*!uiStore\.sidebarCollapsed/,
    "the existing toggle remains usable on narrow screens without persisting a temporary override",
  );
  assert.match(menuBusiness, /window\.addEventListener\("resize"/);
  assert.match(menuBusiness, /window\.removeEventListener\("resize"/);
  assert.match(
    menuBusiness,
    /let\s+storedPreference:\s*string\s*\|\s*null\s*=\s*null[\s\S]*?try\s*\{[\s\S]*?window\.localStorage\.getItem\("sidebar_collapsed"\)[\s\S]*?\}\s*catch\s*\{[\s\S]*?\}/,
    "blocked storage must fall back to the live sidebar state",
  );
  assert.doesNotMatch(
    menuBusiness,
    /sidebarCollapsed\s*=\s*true[\s\S]{0,160}uiStore\.collapseSidebar\(\)/,
    "narrow-screen initialization should not persist over the desktop preference",
  );
});

test("compact composer uses a non-overlapping wrapped toolbar", () => {
  assert.match(input, /@media\s*\(max-width:\s*430px\)/);
  assert.match(
    input,
    /@media\s*\(max-width:\s*430px\)[^\n]*?\.visual-chat-composer__toolbar[^\n]*?flex-wrap:\s*wrap/,
  );
  assert.match(
    input,
    /@media\s*\(max-width:\s*430px\)[^\n]*?\.visual-chat-composer__tools[^\n]*?flex:\s*1 1 100%/,
  );
  assert.match(
    input,
    /@media\s*\(max-width:\s*430px\)[^\n]*?\.visual-chat-composer__actions[^\n]*?margin-left:\s*auto/,
  );
});
