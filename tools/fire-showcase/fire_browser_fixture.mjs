// Offline Chromium fixture using its standard DevTools protocol; no browser
// dependency, external account, provider request or user profile is involved.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(os.tmpdir(), 'fire-browser-fixture-'));
const chrome = spawn(process.env.FIRE_SHOWCASE_TEST_CHROME, ['--headless', '--disable-gpu',
  '--disable-background-networking', '--disable-component-update', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
  'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
chrome.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-4000); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 300; attempt++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(50); }
  }
  assert(port, 'private headless browser did not start: ' + browserLog);
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fixtureErrors = []; window.fixtureHistoryReads = 0;
    window.addEventListener('error', event => fixtureErrors.push(event.message));
    const fixtureOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { fixtureHistoryReads++; return fixtureOpen(...args); };
  ` });
  await call('Page.navigate', { url: process.argv[2] });
  const result = await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `
    (async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      let frame;
      for (let attempt = 0; attempt < 200; attempt++) {
        frame = document.querySelector('iframe');
        const body = frame?.contentDocument?.body;
        if (body?.dataset.fireHostState === 'failed') throw new Error('actual host startup failed');
        if (body?.dataset.fireHostState === 'ready' && !body.classList.contains('auth-pending')) break;
        if (attempt === 199) throw new Error('actual source startup never became ready: ' + JSON.stringify({
          url: location.href, frame: Boolean(frame), body: body?.className, state: body?.dataset.fireHostState,
          errors: frame?.contentWindow?.fixtureErrors, scripts: [...(frame?.contentDocument?.scripts || [])].map(script => script.src) }));
        await delay(25);
      }
      const w = frame.contentWindow, body = w.document.body;
      if (!w.FireUI || !w.GenerationTasks || !w.fireWorkbench) throw new Error('source dependencies missing');
      const editor = w.document.querySelector('textarea'); editor.value = 'fixture unsent draft';
      w.localStorage.setItem('fixture-draft', 'private unsent draft');
      const reads = w.fixtureHistoryReads;
      w.dispatchEvent(new w.MessageEvent('message', { origin: 'http://wrong.test', source: window,
        data: { type: 'fire-showcase:active', active: false } }));
      w.dispatchEvent(new w.MessageEvent('message', { origin: location.origin, source: w,
        data: { type: 'fire-showcase:active', active: false } }));
      if (!w.FireShowcaseHost.isActive()) throw new Error('untrusted activity signal accepted');
      w.postMessage({ type: 'fire-showcase:active', active: false }, location.origin);
      await delay(100);
      const hidden = await (await fetch('/fixture-stats')).json();
      await delay(2800);
      const idle = await (await fetch('/fixture-stats')).json();
      if (idle.tasks !== hidden.tasks) throw new Error('hidden workspace still polls');
      w.postMessage({ type: 'fire-showcase:active', active: true }, location.origin);
      await delay(250);
      const resumed = await (await fetch('/fixture-stats')).json();
      if (resumed.tasks !== idle.tasks + 1) throw new Error('return did not refresh existing tasks exactly once');
      if (resumed.bootstrap !== idle.bootstrap + 1) throw new Error('return did not refresh allowance exactly once');
      if (frame.contentWindow !== w || w.document.body !== body || w.fixtureHistoryReads !== reads) throw new Error('return reinitialized the source app/history');
      if (editor.value !== 'fixture unsent draft' || w.localStorage.getItem('fixture-draft') !== 'private unsent draft') throw new Error('draft changed during hide/return');
      if (w.fixtureErrors.length) throw new Error(w.fixtureErrors.join('; '));
      return { ready: true, historyReads: reads, hiddenTasks: idle.tasks, resumedTasks: resumed.tasks };
    })()
  ` });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  assert.equal(result.result.value.ready, true);
  console.log(JSON.stringify(result.result.value));
} finally {
  socket?.close(); chrome.kill('SIGTERM');
  await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(2000)]);
  if (chrome.exitCode === null) chrome.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
