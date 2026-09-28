import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(read('./menu.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
});
const menuExports = {};
const draftAuth = require('vue').reactive({ isLiteMode: true, currentUserId: 'draft-owner', effectiveTenantId: 'workspace-a' });
runInThisContext(`(function(exports, require) {${outputText}\n})`)(menuExports, (name) => {
  if (name === '@/i18n') return { global: { t: (key) => key, locale: { value: 'zh-CN' } } };
  if (name === '@/stores/auth') return { useAuthStore: () => draftAuth };
  if (name === '@/stores/deploymentCapabilities') return { useDeploymentCapabilitiesStore: () => ({ isSupported: () => true }) };
  return require(name);
});

test('first message retains the selected depth across route navigation and clears it after consumption', () => {
  const store = menuExports.useMenuStore(require('pinia').createPinia());
  for (const effort of ['minimal', 'low', 'medium', 'high', 'none']) {
    store.changeFirstQuery('reply OK', [], 'model-a', [], [], effort !== 'none', effort);
    assert.equal(store.firstModelId, 'model-a');
    assert.equal(store.firstReasoningEffort, effort);
    assert.equal(store.firstThinking, effort !== 'none');
    store.changeFirstQuery('');
    assert.equal(store.firstQuery, '');
    assert.equal(store.firstReasoningEffort, '');
  }
});

test('homepage and chat parent forward the first message depth without an unrelated high fallback', () => {
  const home = read('../views/creatChat/creatChat.vue');
  const chat = read('../assets/business-baselines/ChatIndex.pre-view.vue');
  for (const call of ['createNewSession', 'navigateToSession', 'changeFirstQuery']) {
    assert.match(home, new RegExp(`${call}\\([^;]+thinking, reasoningEffort\\)`));
  }
  assert.match(chat, /sendMsg\(firstQuery\.value,[^;]+firstThinking\.value, firstReasoningEffort\.value\)/);
  assert.doesNotMatch(chat, /reasoningEffort = [^\n]+\|\| 'high'/);
});


test('the unsent homepage draft is isolated to its account and workspace', () => {
  const store = menuExports.useMenuStore(require('pinia').createPinia());
  store.newChatDraft = 'private draft';
  draftAuth.currentUserId = 'another-account';
  assert.equal(store.newChatDraft, '');
  store.newChatDraft = 'workspace-specific draft';
  draftAuth.effectiveTenantId = 'workspace-b';
  assert.equal(store.newChatDraft, '');
});
