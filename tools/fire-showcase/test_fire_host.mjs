// Execute the shipped native host and its real storage consumers. Browser
// facilities and HTTP responses are substituted; no provider/network calls run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const { parseHTML } = require(process.env.ALPHAI_TEST_DOM_MODULE || 'linkedom');
const root = fileURLToPath(new URL('.', import.meta.url));
const hostSource = fs.readFileSync(`${root}site/fire-host.js`, 'utf8');
const appSource = fs.readFileSync(`${root}site/script.js`, 'utf8');
const html = fs.readFileSync(`${root}site/index.html`, 'utf8');
const css = fs.readFileSync(`${root}site/fire-host.css`, 'utf8');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
function browserStorage(values) {
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(String(key)) ?? null, setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)), clear: () => values.clear() };
}

test('the initial native HTML hides legacy branding without any downloadable brand image', () => {
  const document = parseHTML(html).document;
  assert(document.body.classList.contains('fire-workbench'));
  assert(document.body.classList.contains('auth-pending'));
  for (const image of document.querySelectorAll('#legacy-auth-state img, .rail-brand img')) {
    assert.equal(image.getAttribute('src'), null, 'hidden branding must never enter the browser image fetch queue');
    assert.equal(image.getAttribute('srcset'), null);
  }
});
async function host({ user = 'user-a', values = new Map(), autoScripts = true, bootstrapFailure = false, bootstrapStatus = bootstrapFailure ? 503 : 200, allowance = { status: 'active', remaining_images: 10, reserved_images: 2 } } = {}) {
  values.set('weknora_user', JSON.stringify({ id: user })); values.set('weknora_token', `${user}-native-token`);
  const nativeStorage = browserStorage(values);
  const document = parseHTML(html).document;
  const parent = parseHTML('<html theme-mode="dark"><body></body></html>').document;
  // Linkedom's window proxy forwards arbitrary properties to Node globalThis.
  // Keep each real document in a separate browser-global facade so two account
  // fixtures cannot accidentally overwrite one another's native storage/fetch.
  const listeners = new Map(), messages = [];
  class BrowserMutationObserver {
    constructor(callback) { this.callback = callback; this.observers = []; }
    observe(target, options) { const Observer = target.ownerDocument.defaultView.MutationObserver; const observer = new Observer(this.callback); observer.observe(target, options); this.observers.push(observer); }
    disconnect() { for (const observer of this.observers) observer.disconnect(); this.observers = []; }
  }
  const window = { document, parent: { document: parent, postMessage: (data, origin) => messages.push({ data, origin }) }, MutationObserver: BrowserMutationObserver,
    addEventListener(type, callback) { const callbacks = listeners.get(type) || []; callbacks.push(callback); listeners.set(type, callbacks); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); } };
  window.location = { origin: 'https://fire.test', href: 'https://fire.test/tools/fire-showcase/', reload() {} };
  Object.defineProperty(window, 'localStorage', { value: nativeStorage, configurable: true });
  const backend = { bootstrapStatus, user, tenant: 42, allowance, bootstrapError: null };
  const calls = [], scripts = [];
  const originalAppend = window.document.body.append.bind(window.document.body);
  window.document.body.append = (...nodes) => {
    originalAppend(...nodes);
    for (const node of nodes) if (node.tagName === 'SCRIPT') {
      scripts.push(node);
      if (autoScripts) queueMicrotask(() => node.onload());
    }
  };
  window.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
    calls.push({ url, init, headers, input });
    if (url.endsWith('/bootstrap') && backend.bootstrapError) throw backend.bootstrapError;
    const body = url.endsWith('/bootstrap')
      ? { success: backend.bootstrapStatus === 200, data: { user_id: backend.user, tenant_id: backend.tenant, allowance: backend.allowance } }
      : url.endsWith('/api/config') ? { fireIdentity: { user_id: backend.user, tenant_id: backend.tenant }, fireAllowance: backend.allowance }
      : { tasks: [] };
    return new Response(JSON.stringify(body), { status: url.endsWith('/bootstrap') || url.endsWith('/api/config') ? backend.bootstrapStatus : 200, headers: { 'Content-Type': 'application/json' } });
  };
  const context = vm.createContext({ window, document: window.document, location: window.location,
    URL, Request, Headers, Response, MutationObserver: window.MutationObserver, console,
    fetch: (...args) => window.fetch(...args), get localStorage() { return window.localStorage; },
    crypto: webcrypto, atob, setTimeout, clearTimeout, setInterval, clearInterval });
  vm.runInContext(hostSource, context, { filename: 'fire-host.js' });
  await settle();
  return { window, context, values, nativeStorage, calls, scripts, parent, messages, backend };
}

async function readyPollingHost(t) {
  const h = await host();
  h.window.document.body.classList.remove('auth-pending');
  vm.runInContext(fs.readFileSync(`${root}site/generation-tasks.js`, 'utf8'), h.context);
  const client = h.window.GenerationTasks.create({ pollInterval: 10 });
  t.after(() => client.stop());
  h.window.FireShowcaseHost.onActivity(active => { if (active) void client.start(); else client.stop(); });
  await client.start(); await settle();
  h.window.localStorage.setItem('draft', 'private-unsent-draft');
  const draft = h.window.document.createElement('textarea'); draft.value = 'private-editor-draft'; h.window.document.body.append(draft);
  const activity = active => h.window.dispatchEvent({ type: 'message', origin: h.window.location.origin,
    source: h.window.parent, data: { type: 'fire-showcase:active', active } });
  activity(false); await settle();
  return { ...h, activity, draft };
}

for (const failure of [401, 403, 'user', 'tenant', 'session']) test(`returning after ${failure} authentication invalidation removes the ready workspace and stops real polling`, async t => {
  const h = await readyPollingHost(t);
  if (typeof failure === 'number') h.backend.bootstrapStatus = failure;
  if (failure === 'user') h.backend.user = 'user-b';
  if (failure === 'tenant') h.backend.tenant = 99;
  if (failure === 'session') h.nativeStorage.removeItem('weknora_token');
  h.activity(true); await settle();
  assert.equal(h.window.document.body.dataset.fireHostState, 'failed');
  assert.equal(h.window.FireShowcaseHost.canGenerate(), false);
  assert.equal(h.window.document.querySelector('textarea'), null, 'private editor is removed on definite auth failure');
  assert.equal(h.messages.at(-1).data.state, 'failed');
  const afterFailure = h.calls.length;
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(h.calls.length, afterFailure, 'the existing generation client must stop polling');
  assert.equal(h.calls.filter(call => call.init.method === 'POST').length, 0);
});

for (const failure of [503, 'network']) test(`temporary ${failure} on return preserves drafts, disables generation and recovers on the next return`, async t => {
  const h = await readyPollingHost(t);
  const body = h.window.document.body;
  if (failure === 503) h.backend.bootstrapStatus = 503;
  else h.backend.bootstrapError = new TypeError('fixture network offline');
  h.activity(true); await settle();
  assert.equal(h.window.document.body.dataset.fireHostState, 'ready');
  assert.equal(h.window.FireShowcaseHost.canGenerate(), false);
  assert.equal(h.window.FireShowcaseHost.unavailableReason(), '额度暂时无法读取，请稍后重试');
  assert.equal(h.window.document.getElementById('fire-image-allowance').textContent, '额度暂时无法读取，请稍后重试');
  assert.equal(h.window.localStorage.getItem('draft'), 'private-unsent-draft');
  assert.equal(h.draft.value, 'private-editor-draft');
  h.activity(false); h.backend.bootstrapStatus = 200; h.backend.bootstrapError = null;
  h.activity(true); await settle();
  assert.equal(h.window.FireShowcaseHost.canGenerate(), true);
  assert.equal(h.window.document.getElementById('fire-image-allowance').textContent, '可生成 10 张 · 2 张处理中');
  assert.equal(h.window.document.body, body);
  assert.equal(h.draft.value, 'private-editor-draft');
  assert.equal(h.scripts.length, 4, 'recovery must reuse the initialized app');
  assert.equal(h.calls.filter(call => call.init.method === 'POST').length, 0);
});

test('an expired allowance returned with HTTP 200 retains the private workspace and its expiry message', async t => {
  const h = await readyPollingHost(t);
  h.backend.allowance = { status: 'expired', remaining_images: 10 };
  h.activity(true); await settle();
  assert.equal(h.window.document.body.dataset.fireHostState, 'ready');
  assert.equal(h.window.FireShowcaseHost.canGenerate(), false);
  assert.equal(h.window.document.getElementById('fire-image-allowance').textContent, '套餐已到期');
  assert.equal(h.draft.value, 'private-editor-draft');
});

test('native host uses one fresh config for verified identity, allowance and application startup', async () => {
  const h = await host();
  assert.equal(h.calls[0].url, '/api/v1/fire-showcase/api/config');
  assert.equal(h.calls[0].headers.get('authorization'), 'Bearer user-a-native-token');
  const configBody = await (await h.window.fetch('/api/config')).json();
  assert.equal(configBody.fireIdentity.user_id, 'user-a');
  assert.equal(h.calls.length, 1, 'the real application consumes the same fresh response, not a second network read');
  const config = h.calls.at(-1);
  assert.equal(new URL(config.url, h.window.location.origin).pathname, '/api/v1/fire-showcase/api/config');
  assert.equal(config.headers.get('authorization'), 'Bearer user-a-native-token');
  assert.equal(config.init.credentials, 'same-origin'); assert.equal(config.init.cache, 'no-store');
  await h.window.fetch('/tools/fire-showcase/assets/decoration.svg');
  assert.equal(h.calls.at(-1).headers.has('authorization'), false);
  const before = h.calls.length;
  for (const target of ['https://provider.invalid/images', '//provider.invalid/images']) await assert.rejects(h.window.fetch(target), /只通过火种服务/);
  assert.equal(h.calls.length, before, 'no request can send native headers to an external provider');
  await h.window.fetch('data:image/png;base64,AA==');
  assert.equal(h.calls.at(-1).headers.has('authorization'), false, 'local image bytes do not gain native bearer headers');
});

test('native proxy preserves Request method and body while replacing stale app authorization', async () => {
  const h = await host();
  const request = new Request('https://fire.test/api/generation-tasks', { method: 'POST', headers: { Authorization: 'legacy-token', 'Content-Type': 'application/json' }, body: '{"fixture":true}' });
  await h.window.fetch(request);
  const call = h.calls.find(item => item.url.includes('/api/generation-tasks'));
  assert.equal(new URL(call.url).pathname, '/api/v1/fire-showcase/api/generation-tasks');
  assert.equal(call.input.method, 'POST'); assert.equal(await call.input.text(), '{"fixture":true}');
  assert.equal(call.headers.get('authorization'), 'Bearer user-a-native-token');
});

test('owner change blocks both new requests and allowance refresh before any HTTP call', async () => {
  const h = await host();
  h.nativeStorage.setItem('weknora_user', JSON.stringify({ id: 'user-b' }));
  h.nativeStorage.setItem('weknora_token', 'user-b-native-token');
  const before = h.calls.length;
  await assert.rejects(h.window.fetch('/api/assets'), /登录状态已改变/);
  await assert.rejects(h.window.FireShowcaseHost.refreshAllowance(), /登录状态已改变/);
  assert.equal(h.calls.length, before);
});

test('bootstrap failure exposes only retry and never loads the source app scripts', async () => {
  const h = await host({ bootstrapFailure: true });
  assert.equal(h.window.document.body.dataset.fireHostState, 'failed');
  assert.equal(h.scripts.length, 0);
  assert.equal(h.window.document.querySelector('.fire-host-error button').textContent, '重试');
  assert.doesNotMatch(h.window.document.body.textContent, /native-token|DeepSeek|Gemini|GPT|Claude/i);
});

for (const bootstrapStatus of [401, 403]) test(`initial bootstrap ${bootstrapStatus} still fails closed before loading the source app`, async () => {
  const h = await host({ bootstrapStatus });
  assert.equal(h.window.document.body.dataset.fireHostState, 'failed');
  assert.equal(h.scripts.length, 0);
  assert.equal(h.messages.at(-1).data.state, 'failed');
});

test('app scripts are loaded serially after identity bootstrap in the original dependency order', async () => {
  const h = await host({ autoScripts: false });
  assert.equal(h.calls[0].url, '/api/v1/fire-showcase/api/config');
  const expected = ['fire-components.js', 'generation-tasks.js', 'script.js', 'workbench.js'];
  for (let index = 0; index < expected.length; index++) {
    assert.equal(h.scripts.length, index + 1, 'later dependency must wait for prior onload');
    assert.match(h.scripts[index].src, new RegExp(`/${expected[index].replace('.', '\\.')}\\?`));
    h.scripts[index].onload(); await settle();
  }
  assert.equal(h.scripts.length, 4);
});

test('only same-origin parent activity messages pause and resume the existing workspace', async () => {
  const h = await host();
  const changes = [];
  h.window.FireShowcaseHost.onActivity(active => changes.push(active));
  h.window.localStorage.setItem('draft', 'private-unsent-draft');
  const signal = (active, extra = {}) => h.window.dispatchEvent({ type: 'message', origin: h.window.location.origin,
    source: h.window.parent, data: { type: 'fire-showcase:active', active }, ...extra });
  const before = h.calls.length;
  signal(false, { origin: 'https://other.test' });
  signal(false, { source: h.window });
  signal('false');
  assert.equal(h.window.FireShowcaseHost.isActive(), true);
  assert.equal(changes.length, 0);
  signal(false); signal(false); await settle();
  assert.equal(h.window.FireShowcaseHost.isActive(), false);
  assert.deepEqual(changes, [false]);
  assert.equal(h.calls.length, before, 'hiding cannot submit or refetch work');
  signal(true); signal(true); await settle();
  assert.equal(h.window.FireShowcaseHost.isActive(), true);
  assert.deepEqual(changes, [false, true]);
  assert.equal(h.calls.length, before + 1, 'returning refreshes allowance once');
  assert.equal(h.calls.at(-1).url, '/api/v1/fire-showcase/bootstrap');
  assert.equal(h.window.localStorage.getItem('draft'), 'private-unsent-draft');
  assert.equal(h.scripts.length, 4, 'returning cannot reinitialize the source app');
});

test('per-user storage facade hides legacy data and cannot clear native auth or another user drafts', async () => {
  const values = new Map([['legacy-reference', 'unscoped-private-image'], ['fire-showcase:user-b:draft', 'private-b']]);
  const h = await host({ values });
  const storage = h.window.localStorage;
  assert.equal(storage.getItem('legacy-reference'), null);
  assert.equal(storage.getItem('weknora_token'), null);
  storage.setItem('draft', 'private-a'); storage.setItem('weknora_token', 'not-a-native-token');
  assert.equal(values.get('fire-showcase:user-a:draft'), 'private-a');
  assert.equal(storage.length, 2); assert.equal(storage.key(0), 'draft');
  await h.window.fetch('/api/config');
  assert.equal(h.calls.at(-1).headers.get('authorization'), 'Bearer user-a-native-token');
  storage.clear();
  assert.equal(values.get('weknora_token'), 'user-a-native-token');
  assert.equal(values.get('fire-showcase:user-b:draft'), 'private-b');
  const b = await host({ user: 'user-b', values });
  assert.equal(b.window.localStorage.getItem('draft'), 'private-b');
  await assert.rejects(h.window.fetch('/api/config'), /登录状态已改变/, 'old frame cannot act after another native account signed in');
});

test('real generation receipt and reference cache consumers stay within their owning user facade', async () => {
  const receipt = { key: 'receipt-a', path: '/api/generation-tasks', body: { payload: { images: [] } }, status: 'receipt_unknown' };
  const values = new Map([
    ['fire.durable-generation.v1', JSON.stringify([{ ...receipt, key: 'legacy-receipt' }])],
    ['fire-showcase:user-a:fire.durable-generation.v1', JSON.stringify([receipt])],
    ['fire-showcase:user-a:fire.local-assets.v1', JSON.stringify({ fixture: { id: 'private-a-asset' } })]
  ]);
  const source = fs.readFileSync(`${root}site/generation-tasks.js`, 'utf8');
  const a = await host({ values }); vm.runInContext(source, a.context);
  const tasksA = a.window.GenerationTasks.create({ pollInterval: 0 });
  assert.equal(tasksA.snapshot().pending[0].key, 'receipt-a');
  await tasksA.start(); tasksA.stop();
  assert.equal(a.calls.filter(call => call.init.method === 'POST').length, 0, 'opening a saved uncertain receipt must not resubmit generation');
  const b = await host({ user: 'user-b', values }); vm.runInContext(source, b.context);
  const tasksB = b.window.GenerationTasks.create({ pollInterval: 0 });
  assert.equal(tasksB.snapshot().pending.length, 0, 'another user must not recover or resubmit A receipt');
  await tasksB.start(); tasksB.stop();
  assert.equal(b.calls.filter(call => call.init.method === 'POST').length, 0);
  assert.equal(b.window.localStorage.getItem('fire.local-assets.v1'), null);
});

function attachHistoryConsumer(h, records) {
  // Execute the actual account key and IndexedDB read/write functions, retaining
  // their normal asynchronous request callbacks, with one deterministic DB.
  const indexedDB = { open() {
    const opening = {};
    queueMicrotask(() => { opening.result = { objectStoreNames: { contains: () => true }, close() {}, transaction() {
      const transaction = { objectStore: () => ({
        get(key) { const request = {}; queueMicrotask(() => { request.result = records.get(key); request.onsuccess?.(); transaction.oncomplete?.(); }); return request; },
        put(value, key) { records.set(key, value); queueMicrotask(() => transaction.oncomplete?.()); }
      }) }; return transaction;
    } }; opening.onsuccess(); }); return opening;
  } };
  h.window.indexedDB = indexedDB; h.context.indexedDB = indexedDB;
  const functions = appSource.slice(appSource.indexOf('function accountStorageKey('), appSource.indexOf('const defaults ='));
  vm.runInContext(`const historyDatabaseName = 'alphai-image-history', historyStoreName = 'account-history';\n${functions}`, h.context);
}
test('real image history IndexedDB consumer keys private references and results by native user', async () => {
  const values = new Map(), records = new Map();
  const a = await host({ values }); attachHistoryConsumer(a, records);
  await vm.runInContext("historyDatabasePut(accountStorageKey('aiShowcase.imageHistory'), { fixture: 'private-reference-a' })", a.context);
  await vm.runInContext("historyDatabasePut(accountStorageKey('aiShowcase.resultHistory'), ['private-result-a'])", a.context);
  assert.equal(records.get('aiShowcase.imageHistory:fire:user-a').fixture, 'private-reference-a');
  const b = await host({ user: 'user-b', values }); attachHistoryConsumer(b, records);
  assert.equal(await vm.runInContext("historyDatabaseGet(accountStorageKey('aiShowcase.imageHistory'), null)", b.context), null);
  assert.equal(await vm.runInContext("historyDatabaseGet(accountStorageKey('aiShowcase.resultHistory'), null)", b.context), null);
});

test('native UI hides model/provider configuration and displays image count without changing chat percentage', async () => {
  const h = await host();
  const panel = h.window.document.getElementById('model-label').closest('.setting-section');
  assert.equal(panel.classList.contains('fire-native-hidden'), true);
  assert.match(css, /\.fire-native-hidden[^}]*display:\s*none\s*!important/);
  assert.match(css, /#local-status[^}]*#workbench-settings-dialog/);
  const badge = h.window.document.getElementById('fire-image-allowance');
  assert.equal(badge.getAttribute('role'), 'status');
  assert.equal(badge.textContent, '可生成 10 张 · 2 张处理中');
  assert.doesNotMatch(badge.textContent, /Token|DeepSeek|Gemini|GPT|%/i);
  h.parent.documentElement.setAttribute('theme-mode', 'light'); await settle();
  assert.equal(h.window.document.documentElement.dataset.fireTheme, 'light');
});

test('zero images remains zero rather than an unlimited label', async () => {
  const h = await host({ allowance: { status: 'active', remaining_images: 0, reserved_images: 0 } });
  assert.equal(h.window.document.getElementById('fire-image-allowance').textContent, '可生成 0 张');
});


for (const key of ['weknora_user', null]) test(`native storage owner-change signal ${key || 'clear'} hides the old account workspace immediately`, async () => {
  const h = await host({ autoScripts: false });
  const privateView = h.window.document.createElement('p'); privateView.textContent = 'private user A image';
  h.window.document.body.append(privateView);
  h.nativeStorage.setItem('weknora_user', JSON.stringify({ id: 'user-b' }));
  h.window.dispatchEvent({ type: 'storage', key });
  assert.equal(h.window.document.body.dataset.fireHostState, 'failed');
  assert.doesNotMatch(h.window.document.body.textContent, /private user A image/);
  assert.match(h.window.document.body.textContent, /登录状态已改变/);
  const before = h.calls.length;
  await assert.rejects(h.window.fetch('/api/config'), /登录状态已改变/);
  assert.equal(h.calls.length, before);
  h.scripts[0].onload(); await settle();
  assert.equal(h.scripts.length, 1, 'stopped identity must not continue loading later source dependencies');
});

test('returning to a visible stale account workspace hides it before another request is made', async () => {
  const h = await host();
  Object.defineProperty(h.window.document, 'hidden', { value: true, configurable: true });
  h.nativeStorage.removeItem('weknora_token');
  h.window.document.dispatchEvent(new h.window.document.defaultView.Event('visibilitychange'));
  assert.equal(h.window.document.body.dataset.fireHostState, 'ready');
  Object.defineProperty(h.window.document, 'hidden', { value: false, configurable: true });
  h.window.document.dispatchEvent(new h.window.document.defaultView.Event('visibilitychange'));
  assert.equal(h.window.document.body.dataset.fireHostState, 'failed');
  assert.match(h.window.document.body.textContent, /登录状态已改变/);
});

test('image admission uses image balance independently of exhausted chat caps', async () => {
  for (const [allowance, allowed] of [
    [{ status: 'active', remaining_images: 0 }, false],
    [{ status: 'exhausted', remaining_images: 1 }, true],
    [{ status: 'expired', remaining_images: 1 }, false],
    [{ status: 'suspended', remaining_images: 1 }, false],
    [{ status: 'not_activated', remaining_images: 1 }, false],
    [{ status: 'active', unlimited: true, remaining_images: 0 }, true],
  ]) {
    const h = await host({ allowance });
    assert.equal(h.window.FireShowcaseHost.canGenerate(), allowed, JSON.stringify(allowance));
  }
});


test('native readiness notification waits for usable app state, contains no identity, and deduplicates', async () => {
  const h = await host();
  assert.equal(h.window.document.body.dataset.fireHostState, 'ready');
  assert.equal(h.messages.length, 0, 'host marker alone must not bypass app initialization');
  h.window.document.body.classList.remove('auth-pending'); await settle();
  assert.equal(h.messages.length, 1);
  assert.equal(JSON.stringify(h.messages[0]), JSON.stringify({ data: { type: 'fire-showcase:state', state: 'ready' }, origin: 'https://fire.test' }));
  h.window.document.body.classList.add('unrelated-class'); await settle();
  assert.equal(h.messages.length, 1);
  h.window.document.body.dataset.fireHostState = 'failed'; await settle();
  assert.equal(h.messages.length, 2); assert.equal(h.messages[1].data.state, 'failed');
});

test('native stop notifies the same-origin parent even before source app startup finished', async () => {
  const h = await host({ autoScripts: false });
  assert.equal(h.messages.length, 0);
  h.nativeStorage.removeItem('weknora_token');
  h.window.dispatchEvent({ type: 'storage', key: 'weknora_token' }); await settle();
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].data.state, 'failed'); assert.equal(h.messages[0].origin, 'https://fire.test');
});

test('host stops readiness observation when its page is unloaded', async () => {
  const h = await host();
  h.window.dispatchEvent({ type: 'pagehide' });
  h.window.document.body.classList.remove('auth-pending'); await settle();
  assert.equal(h.messages.length, 0);
});

test('host does not announce ready while a source dependency is still loading', async () => {
  const h = await host({ autoScripts: false });
  h.window.document.body.classList.remove('auth-pending'); await settle();
  assert.equal(h.messages.length, 0);
  for (let index = 0; index < 4; index++) { h.scripts[index].onload(); await settle(); }
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].data.state, 'ready');
});
