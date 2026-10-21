/* Native Fire session adapter. Provider calls remain entirely server-side. */
(() => {
  "use strict";
  const nativeStorage = window.localStorage;
  const originalFetch = window.fetch.bind(window);
  const bootstrapPath = "/api/v1/fire-showcase/bootstrap";
  let owner = null;
  let stopped = false;
  let allowanceRefreshedAt = Date.now();
  let allowance = null;
  let active = true;
  let activityListener = null;
  let startupConfig = null;

  function nativeUser() {
    try { return JSON.parse(nativeStorage.getItem("weknora_user") || "null"); }
    catch { return null; }
  }
  function sessionToken() {
    const token = nativeStorage.getItem("weknora_token");
    if (!token || (owner && nativeUser()?.id !== owner.user_id)) throw Object.assign(new Error("登录状态已改变，请重新打开展示面。"), { nativeAuthInvalid: true });
    return token;
  }
  function scopedStorage(userId) {
    const prefix = `fire-showcase:${userId}:`;
    const keys = () => Array.from({ length: nativeStorage.length }, (_, i) => nativeStorage.key(i)).filter(k => k?.startsWith(prefix));
    return {
      get length() { return keys().length; },
      key(i) { return keys()[i]?.slice(prefix.length) ?? null; },
      getItem(k) { return nativeStorage.getItem(prefix + String(k)); },
      setItem(k, v) { nativeStorage.setItem(prefix + String(k), String(v)); },
      removeItem(k) { nativeStorage.removeItem(prefix + String(k)); },
      clear() { keys().forEach(k => nativeStorage.removeItem(k)); }
    };
  }
  function allowanceLabel(s) {
    if (s?.unlimited) return "管理员 · 不计图片额度";
    if (!s) return "额度暂时无法读取，请稍后重试";
    if (s.status === "not_activated") return "暂无图片额度";
    if (s.status === "suspended" || s.status === "expired") return s.status === "suspended" ? "套餐已暂停" : "套餐已到期";
    const left = Math.max(0, Number(s.remaining_images || 0));
    const reserved = Math.max(0, Number(s.reserved_images || 0));
    return `可生成 ${left.toLocaleString("zh-CN")} 张${reserved ? ` · ${reserved} 张处理中` : ""}`;
  }
  function showAllowance(s) {
    allowance = s;
    const label = document.getElementById("fire-image-allowance");
    if (label) label.textContent = allowanceLabel(s);
    window.updateDurableGenerationControls?.();
  }
  async function bootstrap() {
    const response = await originalFetch(bootstrapPath, { headers: { Authorization: `Bearer ${sessionToken()}` }, credentials: "same-origin", cache: "no-store" });
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error("登录状态已失效，请重新登录。"), { nativeAuthInvalid: true });
    const value = await response.json();
    if (!response.ok || !value.success || !value.data?.user_id) throw new Error("展示面暂时无法打开，请稍后重试。");
    if (nativeUser()?.id !== value.data.user_id || (owner && (owner.user_id !== value.data.user_id || String(owner.tenant_id) !== String(value.data.tenant_id)))) {
      throw Object.assign(new Error("登录状态已改变，请重新打开展示面。"), { nativeAuthInvalid: true });
    }
    return value.data;
  }
  function syncTheme() {
    const mode = window.parent.document.documentElement.getAttribute("theme-mode");
    document.documentElement.dataset.fireTheme = mode === "light" ? "light" : "dark";
  }
  let lastParentState = "";
  function notifyParentState() {
    const state = document.body?.dataset.fireHostState;
    if (state !== "failed" && (state !== "ready" || document.body.classList.contains("auth-pending"))) return;
    if (state === lastParentState) return;
    lastParentState = state;
    // Readiness only: no account, token, quota or provider information leaves
    // the frame. Image downloads do not gate the usable editor state.
    window.parent.postMessage({ type: "fire-showcase:state", state }, location.origin);
  }
  const readinessObserver = new MutationObserver(notifyParentState);
  readinessObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-fire-host-state"] });
  window.addEventListener("pagehide", () => readinessObserver.disconnect(), { once: true });
  function fail(error) {
    stopped = true;
    activityListener?.(false);
    document.body.classList.remove("auth-pending");
    document.body.dataset.fireHostState = "failed";
    const panel = document.createElement("div");
    panel.className = "fire-host-error";
    const message = document.createElement("p"); message.textContent = error.message || "展示面暂时无法打开。";
    const button = document.createElement("button"); button.textContent = "重试"; button.onclick = () => location.reload();
    panel.append(message, button); document.body.replaceChildren(panel);
    notifyParentState();
  }
  window.addEventListener("message", event => {
    if (stopped || event.origin !== location.origin || event.source !== window.parent ||
        event.data?.type !== "fire-showcase:active" || typeof event.data.active !== "boolean" || active === event.data.active) return;
    active = event.data.active;
    activityListener?.(active);
    if (active && owner) void window.FireShowcaseHost.refreshAllowance().catch(() => {});
  });
  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = `./${file}?v=20261019-fire-native-01`;
      script.onload = resolve; script.onerror = () => reject(new Error("工作台资源加载失败，请重试。"));
      document.body.append(script);
    });
  }
  async function start() {
    try {
      // The native config already validates the actor and reads fresh quota.
      // One private response initializes both the host and the reused app.
      const response = await originalFetch("/api/v1/fire-showcase/api/config", { headers: { Authorization: `Bearer ${sessionToken()}` }, credentials: "same-origin", cache: "no-store" });
      if (response.status === 401 || response.status === 403) throw Object.assign(new Error("登录状态已失效，请重新登录。"), { nativeAuthInvalid: true });
      const config = await response.clone().json();
      const identity = config.fireIdentity;
      if (!response.ok || !identity?.user_id || !identity.tenant_id || !config.fireAllowance) throw new Error("展示面暂时无法打开，请稍后重试。");
      if (nativeUser()?.id !== identity.user_id) throw new Error("登录状态已改变，请重新打开展示面。");
      owner = { ...identity, allowance: config.fireAllowance };
      startupConfig = response;
      allowanceRefreshedAt = Date.now();
      const checkOwner = () => {
        if (!nativeStorage.getItem("weknora_token") || nativeUser()?.id !== owner.user_id) fail(new Error("登录状态已改变，请重新打开展示面。"));
      };
      window.addEventListener("storage", event => { if (!event.key || event.key === "weknora_user" || event.key === "weknora_token") checkOwner(); });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) checkOwner(); });
      window.FireShowcaseHost = Object.freeze({ userId: owner.user_id, tenantId: owner.tenant_id,
        isActive: () => active,
        onActivity: listener => { activityListener = listener; },
        canGenerate: () => !stopped && Boolean(allowance?.unlimited || (allowance && !["not_activated", "expired", "suspended"].includes(allowance.status) && Number(allowance.remaining_images) > 0)),
        unavailableReason: () => !allowance || ["expired", "suspended"].includes(allowance.status) ? allowanceLabel(allowance) : "图片额度不足",
        refreshAllowance: async () => {
          allowanceRefreshedAt = Date.now();
          try { const data = await bootstrap(); showAllowance(data.allowance); }
          catch (error) { showAllowance(null); if (error?.nativeAuthInvalid) fail(error); throw error; }
        } });
      Object.defineProperty(window, "localStorage", { value: scopedStorage(owner.user_id), configurable: true });
      window.fetch = async (input, init = {}) => {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : String(input), location.href);
        if (url.protocol === "data:" || (url.protocol === "blob:" && url.origin === location.origin)) return originalFetch(input, init);
        if (url.origin !== location.origin) throw new Error("展示面只通过火种服务访问。");
        if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/v1/") && !url.pathname.startsWith("/api/fire-showcase-assets/")) {
          url.pathname = "/api/v1/fire-showcase" + url.pathname;
        }
        const headers = new Headers(request?.headers || {});
        new Headers(init.headers || {}).forEach((v, k) => headers.set(k, v));
        if (url.pathname.startsWith("/api/v1/fire-showcase/") || url.pathname.startsWith("/api/fire-showcase-assets/")) headers.set("Authorization", `Bearer ${sessionToken()}`);
        const reuseStartup = startupConfig && url.pathname === "/api/v1/fire-showcase/api/config" && !url.search && (init.method || request?.method || "GET").toUpperCase() === "GET";
        const response = reuseStartup ? startupConfig : await originalFetch(request ? new Request(url, request) : url, { ...init, headers, credentials: "same-origin", cache: "no-store" });
        if (reuseStartup) startupConfig = null;
        if (url.pathname.endsWith("/api/config") && response.ok) {
          const data = await response.clone().json(); showAllowance(data.fireAllowance);
        }
        if (url.pathname.includes("/api/generation-tasks") && response.ok) {
          const data = await response.clone().json();
          const tasks = data.tasks || (data.task ? [data.task] : []);
          const signature = tasks.map(t => `${t.id}:${t.status}`).sort().join("|");
          const previous = window.FireShowcaseTaskSignature;
          window.FireShowcaseTaskSignature = signature;
          if ((previous !== undefined && signature !== previous) || (init.method || request?.method || "GET").toUpperCase() !== "GET" || Date.now() - allowanceRefreshedAt > 15000) {
            allowanceRefreshedAt = Date.now();
            void window.FireShowcaseHost.refreshAllowance().catch(() => {});
          }
        }
        return response;
      };
      syncTheme();
      const observer = new MutationObserver(syncTheme);
      observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ["theme-mode"] });
      const quota = document.createElement("span"); quota.id = "fire-image-allowance"; quota.setAttribute("role", "status");
      document.querySelector(".app-rail").append(quota); showAllowance(owner.allowance);
      document.querySelector("#model-label")?.closest(".setting-section")?.classList.add("fire-native-hidden");
      // Old app payments and a second account/settings shell are superseded by
      // the native Fire membership and identity. Generation tools stay intact.
      for (const file of ["fire-components.js", "generation-tasks.js", "script.js", "workbench.js"]) { if (stopped) return; await loadScript(file); }
      if (!stopped && document.body.dataset.fireHostState !== "failed") {
        document.body.dataset.fireHostState = "ready";
        notifyParentState();
      }
      window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
    } catch (error) { fail(error); }
  }
  void start();
})();
