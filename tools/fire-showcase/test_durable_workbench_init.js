// Actual app scripts and bridge; only browser facilities and the local HTTP
// contract are substituted. All photos are generated fixtures, never user data.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const { parseHTML } = require(process.env.ALPHAI_TEST_DOM_MODULE || 'linkedom');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const PHOTO = `data:image/png;base64,${PNG}`;
function largeOriginalPng() {
  const width = 4096, height = 1800, rowBytes = width * 3 + 1;
  const pixels = Buffer.alloc(rowBytes * height, 0x47);
  for (let row = 0; row < height; row++) pixels[row * rowBytes] = 0;
  const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    return value >>> 0;
  });
  function chunk(name, content) {
    const body = Buffer.concat([Buffer.from(name), content]);
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(content.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', require('node:zlib').deflateSync(pixels, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}
const roles = ['face', 'hair', 'pose', 'background', 'jewelry', 'body', 'upper', 'lower', 'shoes']
  .map(id => ({ id, label: id, allowMultipleSources: id === 'face' }));
const config = {
  publicMode: true, requireLogin: false, registrationEnabled: false,
  asyncGenerationEnabled: false, durableGenerationEnabled: true,
  generationPaused: true, generationSubmitted: false, maxUploadBytes: null,
  defaultModelChoice: 'quickrouter-image25-sunburst',
  modelOptions: [{ id: 'quickrouter-image25-sunburst', label: 'QuickRouter · GPT Image 2.5 Sunburst', tokenCost: 1 }],
  referenceWorkflow: { roles, providerReferenceLimit: null, requestTargetBytes: null }
};
const calls = [], tasks = new Map(), keys = new Map(), assets = new Map();
const legacyReceipt = {
  key: 'a67b1809-b2ba-4a42-82f6-6a52dba3d16a', operation: 'create',
  status: 'receipt_unknown', path: '/api/generation-tasks',
  body: { idempotencyKey: 'a67b1809-b2ba-4a42-82f6-6a52dba3d16a',
    payload: { modelChoice: 'modelflare-image25-sunburst', images: [] } }
};
const stored = new Map([['fire.durable-generation.v1', JSON.stringify([legacyReceipt])]]);
const storage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: key => stored.delete(key)
};
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) });

function newTask(payload, key, retryOf = null) {
  const createdAt = new Date(Date.now() + tasks.size).toISOString();
  const task = { id: webcrypto.randomUUID(), idempotencyKey: key, idempotencyKeys: [key],
    status: 'queued', createdAt, updatedAt: createdAt, modelChoice: payload.modelChoice,
    referenceCount: payload.images.length, canRetry: false, error: null, result: null, retryOf };
  tasks.set(task.id, task); keys.set(key, task.id);
  return task;
}

async function localHttp(url, options = {}) {
  assert(/^\/api\/(?:config$|prompt$|assets(?:\/|$)|generation-tasks(?:\/|$))/.test(url), `Unexpected HTTP target: ${url}`);
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, method, body });
  if (url === '/api/config') return reply(200, config);
  if (url === '/api/prompt') {
    const valid = body.promptMode === 'custom' ? Boolean(body.prompt) : body.images.length >= 2 && body.images.every(image => image.roles?.length);
    return reply(200, { prompt: `整体协调规则：更自然的五官比例。\n${body.prompt || '参考图合成'}`,
      valid, errors: valid ? [] : ['请完善参考图或画面描述'] });
  }
  if (url === '/api/assets' && method === 'POST') {
    const bytes = Buffer.from(body.dataUrl.split(',')[1], 'base64');
    const id = `sha256_${createHash('sha256').update(bytes).digest('hex')}`;
    if (!assets.has(id)) assets.set(id, { id, name: body.name, mime: 'image/png', bytes: bytes.length, url: `/api/assets/${id}/content` });
    return reply(201, { asset: assets.get(id) });
  }
  const content = url.match(/^\/api\/assets\/(sha256_[a-f0-9]{64})\/content$/);
  if (content) return reply(assets.has(content[1]) ? 200 : 404, {});
  if (url === '/api/generation-tasks' && method === 'GET') return reply(200, { tasks: [...tasks.values()] });
  if (url === '/api/generation-tasks' && method === 'POST') {
    assert.match(body.idempotencyKey, /^[a-f0-9-]{36}$/);
    assert(body.payload.images.every(image => assets.has(image.assetId)), 'Generation must use uploaded asset IDs');
    assert(body.payload.images.every(image => !('dataUrl' in image) && !('path' in image)), 'Generation cannot embed photos or file paths');
    const existing = keys.get(body.idempotencyKey);
    return reply(202, { task: existing ? tasks.get(existing) : newTask(body.payload, body.idempotencyKey) });
  }
  const operation = url.match(/^\/api\/generation-tasks\/([^/]+)(?:\/(retry|cancel))?$/);
  const task = tasks.get(operation?.[1]);
  if (!task) return reply(404, { error: '任务不存在', code: 'not_found' });
  if (!operation[2]) return reply(200, { task });
  if (operation[2] === 'cancel') {
    if (task.status !== 'queued') return reply(409, { error: '只能取消排队任务', code: 'conflict' });
    task.status = 'cancelled'; task.updatedAt = new Date().toISOString();
    return reply(200, { task });
  }
  if (task.status !== 'failed' || !task.canRetry) return reply(409, { error: '结果未确认，禁止重发', code: 'conflict' });
  const existing = keys.get(body.idempotencyKey);
  return reply(202, { task: existing ? tasks.get(existing) : newTask({ modelChoice: task.modelChoice, images: Array(task.referenceCount).fill({}) }, body.idempotencyKey, task.id) });
}

async function startApp() {
  const { window } = parseHTML(fs.readFileSync(`${__dirname}/site/index.html`, 'utf8'));
  const document = window.document;
  let ready = 'loading';
  Object.defineProperty(document, 'readyState', { get: () => ready });
  const location = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/', search: '', protocol: 'http:', reload() {} };
  window.location = location; window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  window.matchMedia = () => ({ matches: false });
  document.querySelectorAll('canvas').forEach(canvas => { canvas.getContext = () => ({ clearRect() {}, drawImage() {}, fillRect() {} }); });
  document.querySelectorAll('select').forEach(select => {
    let value = select.querySelector('option[selected]')?.value || select.querySelector('option')?.value || '';
    Object.defineProperty(select, 'value', { get: () => value, set: next => { value = String(next); } });
  });
  const errors = [];
  // Browser boundary only: preserve Blob bytes through FileReader and emulate
  // the browser decoder; the actual app file/upload/task pipeline stays intact.
  class FixtureFileReader {
    readAsDataURL(file) {
      file.arrayBuffer().then(bytes => {
        this.result = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      }, error => { this.error = error; this.onerror?.(); });
    }
  }
  class FixtureImage {
    set src(value) { this.naturalWidth = 4096; this.naturalHeight = 1800; queueMicrotask(() => this.onload?.()); }
  }
  const context = vm.createContext({ window, document, localStorage: storage, location, URL, URLSearchParams,
    AbortController, TextEncoder, TextDecoder, Blob, FileReader: FixtureFileReader, Element: window.Element, Image: FixtureImage, Event: window.Event,
    setTimeout, clearTimeout, setInterval, clearInterval, performance, navigator: {}, atob, crypto: webcrypto,
    fetch: localHttp, console: { log: console.log, warn() {}, error: (...args) => errors.push(args) } });
  const run = source => vm.runInContext(source, context);
  for (const name of ['fire-components.js', 'generation-tasks.js']) run(fs.readFileSync(`${__dirname}/site/${name}`, 'utf8'));
  const application = fs.readFileSync(`${__dirname}/site/script.js`, 'utf8');
  assert(/\ninit\(\);\s*$/.test(application));
  run(application.replace(/\ninit\(\);\s*$/, '\nglobalThis.startup = init();'));
  run(fs.readFileSync(`${__dirname}/site/workbench.js`, 'utf8'));
  ready = 'interactive'; document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await context.startup;
  assert.equal(errors.length, 0, errors.map(items => items.join(' ')).join('\n'));
  return { document, run, put(name, value) { context[name] = value; }, click(selector) {
    const button = document.querySelector(selector);
    assert(button, `Missing action: ${selector}`);
    button.dispatchEvent(new window.Event('click', { bubbles: true }));
  }, stop() { run('durableClient?.stop(); clearTimeout(promptPreviewTimer); promptPreviewController?.abort();'); } };
}

async function until(check, explanation) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(explanation);
}

async function main() {
  const app = await startApp();
  let reloaded;
  try {
    assert.equal(app.document.querySelector('#generation-tasks-panel').hidden, false);
    assert.equal(tasks.size, 0);
    assert.equal(app.run('els.modelChoice.value'), 'quickrouter-image25-sunburst', 'New users start on the configured default');
    assert.equal(calls.filter(call => call.url === '/api/generation-tasks' && call.method === 'POST').length, 0, 'Startup and route migration never submit a generation');
    assert.equal(JSON.parse(stored.get('fire.durable-generation.v1'))[0].body.payload.modelChoice, 'modelflare-image25-sunburst', 'A pending legacy receipt retains its original provider snapshot');
    assert.equal(app.document.querySelector('#prompt-output').hasAttribute('maxlength'), false, 'Free creation has no arbitrary prompt length ceiling');
    assert.doesNotMatch(app.document.body.textContent, /最终提示词上限/, 'Legacy hidden UI copy must not advertise a removed input cap');
    const originalBytes = largeOriginalPng();
    assert(originalBytes.length > 20 * 1024 * 1024);
    const originalFile = new Blob([originalBytes], { type: 'image/png' });
    Object.defineProperty(originalFile, 'name', { value: 'over-20mib-original.png' });
    app.put('largeFileFixture', originalFile);
    assert.equal(await app.run(`uploadReferenceFile('image-one',largeFileFixture)`), true, 'The real FileReader upload path must accept a file larger than 20 MiB');
    await until(() => app.run(`durableClient.assetState(state.files['image-one']).status==='uploaded'`), 'The >20 MiB original upload did not finish');
    const posted = calls.filter(call => call.url === '/api/assets' && call.method === 'POST').at(-1).body;
    assert(Buffer.from(posted.dataUrl.split(',')[1], 'base64').equals(originalBytes), 'Large FileReader uploads must preserve every original byte');
    assert.equal(app.run(`state.files['image-one'].assetId`), `sha256_${createHash('sha256').update(originalBytes).digest('hex')}`);
    app.run(`applyReferenceSequence(Array.from({length:17},(_,i)=>({name:'face-'+i+'.png',dataUrl:${JSON.stringify(PHOTO)},roles:['face']})));`);
    await until(() => app.run(`currentReferenceSequence().every(image=>durableClient.assetState(image).status==='uploaded')`), 'The 17-reference upload did not finish');
    const manyReferences = await app.run('buildImagePayload()');
    assert.equal(manyReferences.images.length, 17, 'Default synthesis accepts more than 16 shared-face references');
    assert.equal(calls.filter(call => call.url === '/api/generation-tasks' && call.method === 'POST').length, 0, 'Uploading and preparing unlimited references never automatically submits generation');
    app.click('[data-workbench-view="free"]');
    app.run(`els.output.value='自然'.repeat(20000); syncPromptModeUi();`);
    const longPromptPayload = await app.run('buildImagePayload()');
    assert.equal(longPromptPayload.prompt.length, 40000, 'A long free-creation prompt is preserved rather than truncated or rejected');
    assert.equal(app.document.querySelector('#prompt-character-count').textContent, '已输入 40000 字符');
    app.click('[data-workbench-view="studio"]');
    app.run('applyReferenceSequence([]);');
    app.run(`setSlotImage('image-one',{name:'fixture-face.png',dataUrl:${JSON.stringify(PHOTO)},roles:['face']}); setSlotImage('image-two',{name:'fixture-scene.png',dataUrl:${JSON.stringify(PHOTO)},roles:['background']});`);
    await until(() => app.run(`currentReferenceSequence().every(image=>durableClient.assetState(image).status==='uploaded')`), 'Independent uploads did not finish');
    assert.equal(calls.filter(call => call.url === '/api/assets' && call.method === 'POST' && call.body.dataUrl === PHOTO).length, 1, 'Same fixture bytes should upload once');
    assert.equal(app.document.querySelectorAll('.reference-upload-state[data-status="uploaded"]').length, 2);
    assert.equal(app.document.querySelector('#generate-button').disabled, false, 'Paused execution still permits durable queue creation');
    const payload = await app.run('buildImagePayload()');
    assert.equal(payload.images.length, 2);
    assert(payload.images.every(image => image.assetId && !image.dataUrl));
    await app.run('generateImage()');
    await app.run('generateImage()');
    assert.equal(tasks.size, 1, 'Repeated clicks on queued work must share one intent');
    const first = [...tasks.values()][0];
    assert(app.document.querySelector(`[data-task-id="${first.id}"][data-status="queued"]`));

    const asset = [...assets.values()][0];
    first.status = 'succeeded'; first.updatedAt = new Date().toISOString();
    first.result = { images: [asset.url], model: 'fixture-image25', size: '1024x1024' };
    await app.run('durableClient.refresh()');
    assert.equal(app.document.querySelector('#result-view').classList.contains('has-image'), true);
    assert.equal(app.document.querySelector('#result-image').getAttribute('src'), asset.url);
    assert.equal(app.document.querySelector('#download-link').getAttribute('href'), asset.url);
    assert.equal(app.document.querySelector('#download-current-button').disabled, false);
    assert(app.document.querySelector(`[data-task-id="${first.id}"][data-task-action="view"]`));

    await app.run('generateImage()');
    assert.equal(tasks.size, 2, 'An explicit new click after success must create another task without editing inputs');
    const second = [...tasks.values()][1];
    app.click(`[data-task-id="${second.id}"][data-task-action="cancel"]`);
    await until(() => app.document.querySelector(`[data-task-id="${second.id}"][data-status="cancelled"]`), 'Actual cancel UI did not consume its server response');

    await app.run('generateImage()');
    assert.equal(tasks.size, 3);
    const third = [...tasks.values()][2];
    third.status = 'failed'; third.canRetry = true; third.updatedAt = new Date().toISOString();
    third.error = { code: 'unsupported_parameter', providerStatus: 422, providerParam: 'quality',
      providerMessage: 'Fixture quality is unsupported', requestId: 'req_fixture_422', message: '模型明确拒绝了参数。' };
    await app.run('durableClient.refresh()');
    const failed = app.document.querySelector(`.generation-task-card[data-task-id="${third.id}"]`);
    assert.match(failed.textContent, /Fixture quality is unsupported/);
    assert.match(failed.textContent, /quality/);
    assert.match(failed.textContent, /req_fixture_422/);
    app.click(`[data-task-id="${third.id}"][data-task-action="retry"]`);
    await until(() => tasks.size === 4, 'Actual retry UI did not create the authorized retry task');
    const fourth = [...tasks.values()][3];
    assert.equal(fourth.retryOf, third.id);
    fourth.status = 'unknown'; fourth.canRetry = false; fourth.error = { message: '上游结果未知，不能重发', transport: { summary: '连接关闭，未返回 HTTP 响应', curlExitCode: 52, uploadedBytes: 1341855, downloadedBytes: 0, elapsedMs: 2510 } };
    await app.run('durableClient.refresh()');
    assert.equal(app.document.querySelector(`[data-task-id="${fourth.id}"][data-task-action="retry"]`), null);
    const unknownCard = app.document.querySelector(`.generation-task-card[data-task-id="${fourth.id}"]`);
    assert.match(unknownCard.textContent, /未返回 HTTP 响应/);
    assert.match(unknownCard.textContent, /curl 52/);
    assert.match(unknownCard.textContent, /1341855 字节/);
    assert.match(unknownCard.textContent, /2.51 秒/);
    assert.match(unknownCard.textContent, /先查询任务状态/);
    const posts = calls.filter(call => call.method === 'POST').length;
    await assert.rejects(() => app.run(`durableClient.action(${JSON.stringify(fourth.id)},'retry')`), /未确认|禁止重发/);
    assert.equal(calls.filter(call => call.method === 'POST').length, posts);

    app.stop();
    reloaded = await startApp();
    await until(() => reloaded.document.querySelectorAll('.generation-task-card[data-task-id]').length === 4, 'Background startup must restore persisted server tasks');
    assert.equal(reloaded.document.querySelectorAll('.generation-task-card[data-task-id]').length, 4, 'Full startup must consume persisted server tasks');
    assert.equal(reloaded.document.querySelectorAll('.generation-task-card').length, 5, 'The unmodified pending receipt stays visible alongside server tasks');
    assert(reloaded.document.querySelector(`[data-task-id="${legacyReceipt.key}"]`), 'The old receipt stays visible for explicit confirmation');
    assert(reloaded.document.querySelector(`[data-task-id="${fourth.id}"][data-status="unknown"]`));
    assert.equal(reloaded.document.querySelector('#result-image').getAttribute('src'), asset.url, 'Refresh must restore a completed server result into the actual preview');
    assert.equal(calls.filter(call => call.method === 'POST').length, posts, 'Refresh cannot resubmit a generation intent');
    assert(calls.every(call => !call.url.includes('/api/generate')));
    console.log('durable workbench full startup: actual >20 MiB FileReader uploads, exact original hashes, 17 shared-face references, unrestricted prompt length, asset-ID builder, queued click deduplication, task UI, result/download import, new intent after success, queued cancel, safe diagnostics/retry, unknown guard and full refresh restoration passed; zero provider calls');
  } finally {
    app.stop(); reloaded?.stop();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
