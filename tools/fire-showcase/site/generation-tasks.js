/* Local assets and durable generation tasks. Nothing here calls a model provider. */
(() => {
  "use strict";
  const STORAGE_KEY = "fire.durable-generation.v1";
  const ASSET_KEY = "fire.local-assets.v1";

  function create(options = {}) {
    const requestFetch = options.fetch || fetch;
    const storage = options.storage || localStorage;
    const cryptoSource = options.crypto || crypto;
    const interval = options.pollInterval ?? 2500;
    const taskMap = new Map();
    const uploadMap = new Map();
    const hashUploads = new Map();
    const verifiedAssets = new Set();
    const receiptMap = new Map();
    let currentIntent = null;
    let timer = null;
    let refreshPromise = null;
    let listError = "";
    let loading = false;
    let assetCache = {};
    try { const cached = JSON.parse(storage.getItem(ASSET_KEY) || "{}"); assetCache = cached && typeof cached === "object" && !Array.isArray(cached) ? cached : {}; } catch { /* A cache is optional. */ }
    try {
      for (const receipt of JSON.parse(storage.getItem(STORAGE_KEY) || "[]")) {
        if (receipt?.key && receipt.path && receipt.body) receiptMap.set(receipt.key, { ...receipt, status: receipt.status === "rejected" ? "rejected" : "receipt_unknown", promise: null });
      }
    } catch { /* Server state remains authoritative. */ }

    function persist() {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify([...receiptMap.values()].filter(item => item.status !== "accepted").map(({ promise, ...item }) => item)));
        storage.setItem(ASSET_KEY, JSON.stringify(assetCache));
      } catch { /* The current session still keeps the same receipt key. */ }
    }

    function snapshot() {
      return {
        tasks: [...taskMap.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
        pending: [...receiptMap.values()].filter(item => item.status !== "accepted").map(({ promise, ...item }) => ({ ...item })),
        loading, error: listError
      };
    }
    function emit() { options.onChange?.(snapshot()); }
    function accept(task) {
      if (!task?.id) throw new Error("本地服务没有返回任务编号，请确认本次提交。");
      taskMap.set(task.id, task);
      for (const receipt of receiptMap.values()) {
        if (receipt.key === task.idempotencyKey || (task.idempotencyKeys || []).includes(receipt.key) || receipt.taskId === task.id) {
          receipt.status = "accepted"; receipt.taskId = task.id; receipt.error = "";
        }
      }
      persist(); emit(); return task;
    }
    async function request(path, body) {
      const response = await requestFetch(path, {
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.headers?.() || {}) },
        cache: "no-store"
      });
      let data;
      try { data = JSON.parse(await response.text()); } catch { throw new Error("本地服务回执暂时无法读取，请确认本次提交。"); }
      if (!response.ok) {
        const error = new Error(typeof data.error === "string" ? data.error : data.error?.message || "本地请求失败，请稍后重试。");
        error.status = response.status; error.code = data.code || data.error?.code; throw error;
      }
      return data;
    }
    function assetState(image) {
      const url = typeof image === "string" ? image : image?.dataUrl;
      const record = uploadMap.get(url);
      const matches = record && record.transfer === url;
      return matches ? { status: record.status, asset: record.asset || null, error: record.error || "" } : { status: "idle", asset: null, error: "" };
    }
    async function hashPhoto(dataUrl) {
      const match = String(dataUrl || "").match(/^data:image\/[^;,]+;base64,([a-zA-Z0-9+/=\s]+)$/);
      if (!match) throw new Error("图片内容无效，请重新选择图片。");
      const encoded = match[1].replace(/\s/g, "");
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const digest = await cryptoSource.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    }
    function upload(image, { retry = false } = {}) {
      const dataUrl = image?.dataUrl;
      // dataUrl is the original. Older saved records may also contain a smaller
      // uploadDataUrl; never let that obsolete copy reach a new generation.
      const transfer = dataUrl;
      const cachedRecord = uploadMap.get(dataUrl);
      const previous = cachedRecord?.transfer === transfer ? cachedRecord : null;
      if (previous?.promise) return previous.promise;
      if (previous?.status === "uploaded" && !retry) return Promise.resolve(previous.asset);
      if (previous?.status === "failed" && !retry) return Promise.reject(new Error(previous.error));
      const record = { status: "uploading", asset: null, error: "", promise: null, transfer };
      uploadMap.set(dataUrl, record); emit();
      record.promise = (async () => {
        try {
          const hash = await hashPhoto(transfer);
          let shared = hashUploads.get(hash);
          if (!shared) {
            shared = (async () => {
              let cached = !retry ? assetCache[hash] : null;
              if (cached?.id && !verifiedAssets.has(cached.id)) {
                const check = await requestFetch(cached.url || `/api/assets/${encodeURIComponent(cached.id)}/content`, { method: "HEAD", cache: "no-store", headers: options.headers?.() || {} });
                if (check.status === 404) { delete assetCache[hash]; cached = null; persist(); }
                else if (!check.ok) throw new Error("本机素材暂时无法确认，请重新保存。");
                else verifiedAssets.add(cached.id);
              }
              if (cached?.id) return cached;
              const result = await request("/api/assets", { dataUrl: transfer, name: image.name || "reference-image.jpg" });
              if (!result.asset?.id) throw new Error("素材保存回执无效，请重新上传。");
              assetCache[hash] = result.asset; verifiedAssets.add(result.asset.id); persist(); return result.asset;
            })().finally(() => hashUploads.delete(hash));
            hashUploads.set(hash, shared);
          }
          const asset = await shared;
          record.asset = asset; record.status = "uploaded"; record.error = ""; return asset;
        } catch (error) {
          record.asset = null; record.status = "failed"; record.error = error.message || "素材未保存，请重新上传。"; throw error;
        } finally { record.promise = null; emit(); }
      })();
      return record.promise;
    }
    async function sendReceipt(receipt) {
      if (receipt.promise) return receipt.promise;
      receipt.status = "sending"; receipt.error = ""; persist(); emit();
      receipt.promise = (async () => {
        try {
          const { task } = await request(receipt.path, receipt.body);
          receipt.status = "accepted"; receipt.taskId = task?.id;
          return accept(task);
        } catch (error) {
          // A transport failure says nothing about whether the server committed.
          // The original key/body are retained for the same request's recovery.
          receipt.status = error.status >= 400 && error.status < 500 ? "rejected" : "receipt_unknown";
          receipt.error = error.message;
          if (receipt.operation === "create" && error.status === 404) {
            const identifiers = new Set((receipt.body.payload.images || []).map((image) => image.assetId));
            for (const [hash, asset] of Object.entries(assetCache)) if (identifiers.has(asset.id)) { delete assetCache[hash]; verifiedAssets.delete(asset.id); }
            for (const upload of uploadMap.values()) if (identifiers.has(upload.asset?.id)) { upload.status = "failed"; upload.asset = null; upload.error = "本机素材已失效，请重新保存。"; }
          }
          throw error;
        } finally { receipt.promise = null; persist(); emit(); }
      })();
      return receipt.promise;
    }
    function submit(payload) {
      const immutable = JSON.parse(JSON.stringify(payload));
      const fingerprint = JSON.stringify(immutable);
      let receipt = currentIntent && receiptMap.get(currentIntent);
      const currentTask = receipt?.taskId && taskMap.get(receipt.taskId);
      if (currentTask && ["succeeded", "cancelled"].includes(currentTask.status)) receipt = null;
      if (!receipt || receipt.fingerprint !== fingerprint) {
        receipt = [...receiptMap.values()].find(item => item.operation === "create" && ["sending", "receipt_unknown"].includes(item.status) && item.fingerprint === fingerprint);
      }
      if (!receipt) {
        const key = cryptoSource.randomUUID();
        receipt = { key, operation: "create", fingerprint, path: "/api/generation-tasks", body: { idempotencyKey: key, payload: immutable }, status: "sending", createdAt: new Date().toISOString() };
        receiptMap.set(key, receipt);
      }
      currentIntent = receipt.key;
      if (receipt.status === "accepted" && taskMap.has(receipt.taskId)) return Promise.resolve(taskMap.get(receipt.taskId));
      return sendReceipt(receipt);
    }
    function refresh() {
      if (refreshPromise) return refreshPromise;
      loading = true; emit();
      refreshPromise = (async () => {
        try {
          const result = await request("/api/generation-tasks");
          if (!Array.isArray(result.tasks)) throw new Error("任务列表暂时无法读取。");
          for (const task of result.tasks) accept(task);
          listError = "";
        } catch (error) { listError = error.message || "任务状态暂时无法同步。"; }
        finally { loading = false; refreshPromise = null; emit(); }
        return snapshot();
      })();
      return refreshPromise;
    }
    async function action(id, operation) {
      if (operation === "dismiss") {
        if (receiptMap.get(id)?.status !== "rejected") throw new Error("只有明确拒绝的提交可以关闭。");
        receiptMap.delete(id); if (currentIntent === id) currentIntent = null; persist(); emit(); return null;
      }
      if (operation === "recover") {
        const receipt = receiptMap.get(id);
        if (!receipt) throw new Error("这次提交已经确认，请刷新任务列表。");
        if (receipt.status === "rejected") throw new Error("本地服务已明确拒绝，请先修正素材或设置。");
        return sendReceipt(receipt);
      }
      const task = taskMap.get(id);
      if (!task) throw new Error("任务尚未载入，请刷新列表。");
      const path = `/api/generation-tasks/${encodeURIComponent(id)}`;
      if (operation === "refresh") return accept((await request(path)).task);
      if (operation === "cancel") {
        if (task.status !== "queued") throw new Error("只有排队中的任务可以取消。");
        return accept((await request(`${path}/cancel`, {})).task);
      }
      if (operation !== "retry" || task.status !== "failed" || !task.canRetry) throw new Error("结果尚未确认或任务不允许重试，请先刷新查询，禁止重发。");
      const fingerprint = `${id}:${task.updatedAt || ""}`;
      let receipt = [...receiptMap.values()].find(item => item.operation === "retry" && item.fingerprint === fingerprint);
      if (!receipt) {
        const key = cryptoSource.randomUUID();
        receipt = { key, operation: "retry", fingerprint, path: `${path}/retry`, body: { idempotencyKey: key }, status: "sending", createdAt: new Date().toISOString() };
        receiptMap.set(key, receipt);
      }
      if (receipt.status === "accepted" && taskMap.has(receipt.taskId)) return taskMap.get(receipt.taskId);
      return sendReceipt(receipt);
    }
    function start() {
      if (interval > 0 && !timer) timer = setInterval(() => { void refresh(); }, interval);
      return refresh();
    }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    return { upload, assetState, submit, refresh, action, start, stop, snapshot, changed() { currentIntent = null; } };
  }
  window.GenerationTasks = { create };
})();
