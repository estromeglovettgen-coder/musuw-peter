/* The visible workspace shell. The existing generator owns images and requests. */
(() => {
  "use strict";
  let bridge = null;
  let activeView = "studio";
  const collectionLimits = { materials: 20, history: 20 };
  const views = new Map([
    ["studio", document.querySelector("#studio")],
    ["materials", document.querySelector("#materials-view")],
    ["history", document.querySelector("#history-view")]
  ]);
  const icon = (name) => window.FireUI?.icon(name, { size: 20 }) || "";
  const freeCreation = () => document.body.dataset.creationMode === "free";
  const creationView = () => freeCreation() ? "free" : "studio";

  function renderCreationMode() {
    const free = freeCreation();
    const panel = document.querySelector("#free-create-panel");
    if (panel) panel.hidden = !free;
    const guidance = document.querySelector("#reference-guidance");
    if (guidance) guidance.hidden = free;
    const title = document.querySelector("#reference-panel-title");
    if (title) title.textContent = free ? "自由创作" : "参考素材";
    const description = document.querySelector("#reference-panel-description");
    if (description) description.textContent = free ? "写下画面想法，参考图片随需添加" : "至少 2 张图片，自由组合参考内容";
    const placeholder = document.querySelector("#preview-placeholder");
    const heading = placeholder?.querySelector("strong");
    if (heading) heading.textContent = free ? "你的下一个画面，从想法开始" : "让参考成为你的下一张作品";
    const copy = placeholder?.querySelector("p");
    if (copy) copy.textContent = free ? "在左侧描述画面，生成后在这里查看作品。" : "添加参考图并选择要素，成片会在这里展示。";
  }

  function navigate(view) {
    const target = view === "free" || views.has(view) ? view : "studio";
    activeView = target;
    if (target === "free" || target === "studio") {
      const mode = target === "free" ? "free" : "compose";
      if (document.body.dataset.creationMode !== mode) {
        document.body.dataset.creationMode = mode;
        bridge?.setCreationMode?.(mode === "free" ? "custom" : "default");
      }
    }
    const visibleView = target === "free" ? "studio" : target;
    views.forEach((element, name) => { if (element) element.hidden = name !== visibleView; });
    document.querySelectorAll("[data-workbench-view]").forEach((button) => {
      const active = button.dataset.workbenchView === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    refresh();
  }

  function button(label, iconName, attributes = {}) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "fire-button";
    element.dataset.variant = "secondary";
    element.dataset.size = "sm";
    element.innerHTML = icon(iconName);
    const text = document.createElement("span");
    text.textContent = label;
    text.setAttribute("data-button-label", "");
    element.append(text);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  function emptyState(target, title, description, action) {
    const empty = document.createElement("div");
    empty.className = "fire-empty-state collection-empty-state";
    const graphic = document.createElement("span");
    graphic.className = "empty-state-icon";
    graphic.innerHTML = icon(activeView === "history" ? "clock" : "images");
    const heading = document.createElement("h2");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = description;
    empty.append(graphic, heading, copy, action);
    target.append(empty);
  }

  function renderMaterials() {
    const target = document.querySelector("#materials-grid");
    if (!target || !bridge) return;
    target.replaceChildren();
    const materials = bridge.getMaterials?.() || [];
    const removedCount = bridge.getRemovedMaterialCount?.() || 0;
    if (removedCount) {
      const restore = button(`恢复已移除素材（${removedCount}）`, "arrows-clockwise", { "data-material-restore": "" });
      restore.classList.add("collection-recovery"); target.append(restore);
    }
    if (!materials.length) {
      const action = button("上传第一张素材", "plus", { "data-upload-references": "" });
      emptyState(target, "你的素材库，等你来填满", "上传人像、穿搭或场景照片，素材会保存在这台设备上。", action);
      return;
    }
    materials.slice(0, collectionLimits.materials).forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "collection-card workspace-image-card material-card";
      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "collection-image-button";
      imageButton.dataset.materialPreview = String(index);
      imageButton.setAttribute("aria-label", `查看${item.name || "参考素材"}`);
      const image = document.createElement("img");
      image.src = item.previewDataUrl || item.dataUrl;
      image.alt = item.name || "参考素材";
      image.loading = "lazy";
      imageButton.append(image);
      const details = document.createElement("div");
      details.className = "collection-card-details";
      const name = document.createElement("strong");
      name.textContent = item.name || "参考素材";
      const use = button("用于创作", "plus", { "data-material-use": String(index) });
      const remove = button("移除素材", "trash", { "data-material-remove": String(index) });
      details.append(name, use, remove);
      card.append(imageButton, details);
      target.append(card);
    });
    if (materials.length > collectionLimits.materials) appendLoadMore(target, "materials", materials.length);
  }

  function renderHistory() {
    const target = document.querySelector("#history-grid");
    if (!target || !bridge) return;
    target.replaceChildren();
    const results = bridge.getResults?.() || [];
    const removedCount = bridge.getRemovedResultCount?.() || 0;
    if (removedCount) {
      const restore = button(`恢复已移除作品（${removedCount}）`, "arrows-clockwise", { "data-history-restore": "" });
      restore.classList.add("collection-recovery"); target.append(restore);
    }
    if (!results.length) {
      const action = button("开始一次创作", "sparkle", { "data-return-studio": "" });
      emptyState(target, "下一张作品，从这里开始", "完成生成后，作品将出现在这里，随时预览或下载原图。", action);
      return;
    }
    results.slice(0, collectionLimits.history).forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "collection-card workspace-image-card history-card";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "collection-image-button";
      open.dataset.historyOpen = String(index);
      open.setAttribute("aria-label", `预览${item.meta || "历史作品"}`);
      const image = document.createElement("img");
      image.src = item.image;
      image.alt = item.meta || "历史作品";
      image.loading = "lazy";
      open.append(image);
      const details = document.createElement("div");
      details.className = "collection-card-details";
      const name = document.createElement("strong");
      name.textContent = item.meta || "生成作品";
      const date = document.createElement("small");
      date.textContent = item.savedAt ? new Date(item.savedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "保存在本机";
      const download = button("下载原图", "download-simple", { "data-history-download": String(index) });
      const use = button("用作参考", "plus", { "data-history-use": String(index) });
      const remove = button("移除作品", "trash", { "data-history-remove": String(index) });
      details.append(name, date, use, download, remove);
      card.append(open, details);
      target.append(card);
    });
    if (results.length > collectionLimits.history) appendLoadMore(target, "history", results.length);
  }

  function appendLoadMore(target, collection, total) {
    const more = button(`加载更多（还有 ${total - collectionLimits[collection]} 张）`, "plus", { "data-collection-more": collection });
    more.classList.add("collection-recovery"); target.append(more);
  }

  function renderSelection() {
    if (!bridge) return;
    const references = bridge.getReferences?.() || [];
    const roles = bridge.getRoles?.() || [];
    const count = document.querySelector("#selected-reference-count");
    if (count) count.textContent = String(references.length);
    const thumbs = document.querySelector("#selected-reference-thumbs");
    if (thumbs) {
      thumbs.replaceChildren();
      references.forEach((item, index) => {
        const thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "selected-reference-thumb";
        thumb.dataset.referencePreview = item.slotId;
        thumb.title = `图 ${index + 1} · ${item.name || "参考图"}`;
        const image = document.createElement("img");
        image.src = item.previewDataUrl || item.dataUrl;
        image.alt = `图 ${index + 1}`;
        thumb.append(image);
        thumbs.append(thumb);
      });
    }
    const summary = document.querySelector("#selection-summary");
    if (summary) {
      summary.replaceChildren();
      (freeCreation() ? [] : roles).forEach((role) => {
        const sources = references.filter((item) => (item.roles || []).includes(role.id));
        if (!sources.length) return;
        const chip = document.createElement("span");
        chip.className = "selection-summary-chip fire-badge";
        chip.textContent = `${role.label}${role.allowMultipleSources ? ` ${sources.length} 张` : ""}`;
        summary.append(chip);
      });
    }
    const validation = bridge.getValidation?.() || { valid: false, errors: [] };
    const uploadsReady = !bridge.getSiteConfig?.().durableGenerationEnabled || references.every((item) => bridge.getReferenceUpload?.(item).status === "uploaded");
    const ready = document.querySelector("#reference-ready-state");
    if (ready) {
      ready.textContent = validation.valid && uploadsReady ? "已就绪" : !uploadsReady ? "素材待保存" : freeCreation() ? "填写画面描述" : references.length ? "待完善选择" : "等待素材";
      ready.dataset.tone = validation.valid && uploadsReady ? "success" : "neutral";
    }
    const errors = document.querySelector("#selection-validation");
    if (errors) errors.textContent = freeCreation() ? (validation.errors || []).join(" ") : references.length ? (validation.errors || []).join(" ") : "脸部可选同一人的多张照片。";
  }

  function renderStatus() {
    if (!bridge) return;
    const config = bridge.getSiteConfig?.() || {};
    const paused = Boolean(config.generationPaused);
    const submitted = Boolean(config.generationSubmitted) && !config.durableGenerationEnabled;
    const status = document.querySelector("#workbench-generation-state");
    if (status) {
      status.textContent = paused && config.durableGenerationEnabled ? "生成已暂停 · 新任务会先保存排队" : paused ? "生成已暂停 · 可继续整理参考素材" : submitted ? "本次请求已提交 · 可继续整理参考素材" : window.FireShowcaseHost ? "已就绪" : "已连接本地工作台";
      status.dataset.tone = paused || submitted ? "neutral" : "success";
    }
    const model = document.querySelector("#model-choice");
    const option = (config.modelOptions || []).find((item) => item.id === model?.value);
    const modelName = document.querySelector("#settings-model-name");
    if (modelName) modelName.textContent = option?.label || config.modelOptions?.[0]?.label || "模型尚未加载";
    const transferStatus = document.querySelector("#settings-transfer-status");
    if (transferStatus) transferStatus.textContent = String(option?.id || "").startsWith("quickrouter-") ? "原图 · multipart 上传 · 不压缩" : "原图 · 按当前线路协议上传 · 不压缩";
    const settingsStatus = document.querySelector("#settings-generation-status");
    if (settingsStatus) settingsStatus.textContent = paused && config.durableGenerationEnabled ? "生成已暂停；素材与任务可保存在本机，等待开启" : paused ? "已暂停，整理素材不会发起生成" : submitted ? "本次请求已提交，不会重复提交" : "本地连接就绪，点击生成后才会提交";
    const download = document.querySelector("#download-current-button");
    if (download) download.disabled = !bridge.getActiveResult?.()?.image;
  }

  function renderUploads() {
    if (!bridge) return;
    const enabled = Boolean(bridge.getSiteConfig?.().durableGenerationEnabled);
    document.querySelectorAll(".reference-upload-state").forEach((node) => node.remove());
    if (!enabled) return;
    for (const image of bridge.getReferences?.() || []) {
      const block = document.querySelector(`#${image.slotId}`)?.closest(".upload-block");
      if (!block) continue;
      const upload = bridge.getReferenceUpload?.(image) || { status: "idle" };
      const state = document.createElement("div");
      state.className = "reference-upload-state";
      state.dataset.status = upload.status;
      const text = document.createElement("span");
      text.textContent = upload.status === "uploaded" ? "素材已保存" : upload.status === "failed" ? upload.error || "素材保存失败" : upload.status === "uploading" ? (window.FireShowcaseHost ? "正在保存原图，较大图片请稍候…" : "正在保存素材…") : "等待保存素材";
      state.append(text);
      if (upload.status === "failed") state.append(button("重新保存", "arrows-clockwise", { "data-upload-retry": image.slotId }));
      block.append(state);
    }
  }

  function renderTasks() {
    const panel = document.querySelector("#generation-tasks-panel");
    if (!panel || !bridge) return;
    panel.hidden = !bridge.getSiteConfig?.().durableGenerationEnabled;
    if (panel.hidden) return;
    const state = bridge.getTaskState?.() || { tasks: [], pending: [], error: "" };
    const list = document.querySelector("#generation-task-list");
    list.replaceChildren();
    const count = document.querySelector("#generation-task-count");
    if (count) count.textContent = String(state.tasks.length + state.pending.length);
    const sync = document.querySelector("#generation-task-sync-error");
    if (sync) sync.textContent = state.error || "";
    for (const receipt of state.pending) {
      const row = document.createElement("article");
      row.className = "generation-task-card";
      row.dataset.status = receipt.status;
      const title = document.createElement("strong");
      title.textContent = receipt.status === "sending" ? "正在保存任务…" : receipt.status === "rejected" ? "任务未保存" : "提交结果待确认";
      const detail = document.createElement("p");
      detail.textContent = receipt.status === "sending" ? "正在等待本机服务回执。" : receipt.status === "rejected" ? `${receipt.error || "本地服务拒绝了这次提交。"} 请调整素材或设置后重新保存。` : "尚未收到回执。确认此提交会沿用原请求，不会创建重复任务。";
      row.append(title, detail);
      if (receipt.status === "rejected") row.append(button("知道了", "x", { "data-task-action": "dismiss", "data-task-id": receipt.key }));
      else if (receipt.status !== "sending") row.append(button("确认本次提交", "arrows-clockwise", { "data-task-action": "recover", "data-task-id": receipt.key }));
      list.append(row);
    }
    const labels = { queued: bridge.getSiteConfig?.().generationPaused ? "已保存，等待生成开启" : "排队中", preparing: "正在准备图片", submitting: "正在生成", succeeded: "已完成", failed: "生成失败", unknown: "结果待确认", cancelled: "已取消" };
    for (const task of state.tasks) {
      const row = document.createElement("article");
      row.className = "generation-task-card";
      row.dataset.status = task.status;
      row.dataset.taskId = task.id;
      const heading = document.createElement("div");
      heading.className = "generation-task-heading";
      const title = document.createElement("strong");
      title.textContent = labels[task.status] || "正在同步状态";
      const info = document.createElement("small");
      info.textContent = `${Number(task.referenceCount || 0)} 张参考图`;
      heading.append(title, info);
      row.append(heading);
      const detail = document.createElement("p");
      detail.textContent = task.status === "unknown" ? "结果尚未确认，先查询任务状态，请勿重复生成" : task.error?.message || (task.status === "queued" ? "离开页面后，任务也会保留。" : "");
      if (detail.textContent) row.append(detail);
      if ((!window.FireShowcaseHost || task.status !== "unknown") && (task.error?.providerMessage || task.error?.providerParam)) {
        const provider = document.createElement("small");
        provider.className = "task-provider-error";
        provider.textContent = [task.error.providerMessage, task.error.providerParam ? `相关参数：${task.error.providerParam}` : ""].filter(Boolean).join(" · ");
        row.append(provider);
      }
      if ((!window.FireShowcaseHost || task.status !== "unknown") && task.error?.transport?.summary) {
        const transport = task.error.transport;
        const diagnostic = document.createElement("small");
        diagnostic.className = "task-provider-error";
        diagnostic.textContent = [transport.summary,
          Number.isInteger(transport.curlExitCode) ? `curl ${transport.curlExitCode}` : "",
          Number.isInteger(transport.uploadedBytes) ? `已发送 ${transport.uploadedBytes} 字节` : "",
          Number.isInteger(transport.downloadedBytes) ? `已接收 ${transport.downloadedBytes} 字节` : "",
          Number.isFinite(transport.elapsedMs) ? `耗时 ${(transport.elapsedMs / 1000).toFixed(2)} 秒` : ""
        ].filter(Boolean).join(" · ");
        row.append(diagnostic);
      }
      if (task.error?.requestId || task.error?.request_id) {
        const id = document.createElement("small");
        id.className = "task-request-id";
        id.textContent = `请求编号：${task.error.requestId || task.error.request_id}`;
        row.append(id);
      }
      const actions = document.createElement("div");
      actions.className = "generation-task-actions";
      actions.append(button("查询", "arrows-clockwise", { "data-task-action": "refresh", "data-task-id": task.id }));
      if (task.status === "succeeded" && task.result?.images?.length) actions.append(button("查看作品", "eye", { "data-task-action": "view", "data-task-id": task.id }));
      if (task.status === "failed" && task.canRetry) actions.append(button(task.error?.localResultAvailable ? "恢复图片" : "重试", "arrows-clockwise", { "data-task-action": "retry", "data-task-id": task.id }));
      if (task.status === "queued") actions.append(button("取消排队", "x", { "data-task-action": "cancel", "data-task-id": task.id }));
      row.append(actions); list.append(row);
    }
    if (!state.tasks.length && !state.pending.length) {
      const empty = document.createElement("p");
      empty.className = "generation-tasks-empty";
      empty.textContent = "暂无任务。素材保存完成后，可以创建多个作品任务。";
      list.append(empty);
    }
  }

  function refresh() {
    if (!bridge) return;
    renderCreationMode();
    window.FireUI?.enhanceChoices?.(document);
    renderSelection();
    renderStatus();
    renderUploads();
    renderTasks();
    if (activeView === "materials") renderMaterials();
    if (activeView === "history") renderHistory();
  }

  document.addEventListener("click", (event) => {
    const more = event.target.closest("[data-collection-more]");
    if (more && Object.hasOwn(collectionLimits, more.dataset.collectionMore)) {
      collectionLimits[more.dataset.collectionMore] += 20;
      if (more.dataset.collectionMore === "materials") renderMaterials(); else renderHistory();
      return;
    }
    const nav = event.target.closest("[data-workbench-view]");
    if (nav) { navigate(nav.dataset.workbenchView); return; }
    if (event.target.closest("[data-brand-home]")) { event.preventDefault(); navigate("studio"); return; }
    if (event.target.closest("[data-return-studio]")) { navigate(creationView()); return; }
    if (event.target.closest("[data-open-history]")) { navigate("history"); return; }
    if (event.target.closest("#upload-references-button, [data-upload-references]")) {
      navigate(creationView()); document.querySelector("#reference-batch-input")?.click(); return;
    }
    if (event.target.closest("[data-material-restore]")) { bridge?.restoreMaterials?.(); return; }
    if (event.target.closest("[data-history-restore]")) { bridge?.restoreResults?.(); return; }
    const materialRemove = event.target.closest("[data-material-remove]");
    if (materialRemove && bridge) { bridge.removeMaterial?.(bridge.getMaterials?.()[Number(materialRemove.dataset.materialRemove)]); return; }
    const historyRemove = event.target.closest("[data-history-remove]");
    if (historyRemove && bridge) { bridge.removeResult?.(bridge.getResults?.()[Number(historyRemove.dataset.historyRemove)]); return; }
    const materialUse = event.target.closest("[data-material-use]");
    if (materialUse && bridge) {
      const item = bridge.getMaterials?.()[Number(materialUse.getAttribute("data-material-use"))];
      if (item && bridge.useMaterial?.(item) !== false) navigate(creationView());
      return;
    }
    const materialPreview = event.target.closest("[data-material-preview]");
    if (materialPreview && bridge) { bridge.previewMaterial?.(bridge.getMaterials?.()[Number(materialPreview.dataset.materialPreview)]); return; }
    const retryUpload = event.target.closest("[data-upload-retry]");
    if (retryUpload && bridge) { bridge.retryReferenceUpload?.(retryUpload.getAttribute("data-upload-retry")); return; }
    if (event.target.closest("[data-task-list-refresh]")) { void bridge?.taskAction?.("", "list"); return; }
    const taskAction = event.target.closest("[data-task-action]");
    if (taskAction && bridge) {
      const id = taskAction.getAttribute("data-task-id");
      const action = taskAction.getAttribute("data-task-action");
      if (action === "view") { bridge.showTaskResult?.(id); navigate(creationView()); }
      else { taskAction.disabled = true; void Promise.resolve(bridge.taskAction?.(id, action)).finally(refresh); }
      return;
    }
    const move = event.target.closest("[data-move-reference]");
    if (move && bridge) { bridge.moveReference?.(move.dataset.moveReference, Number(move.dataset.direction)); return; }
    const reference = event.target.closest("[data-reference-preview]");
    if (reference && bridge) { bridge.previewReference?.(reference.dataset.referencePreview); return; }
    const historyOpen = event.target.closest("[data-history-open]");
    if (historyOpen && bridge) {
      const item = bridge.getResults?.()[Number(historyOpen.dataset.historyOpen)];
      if (item) { bridge.showResult?.(item); navigate(creationView()); }
      return;
    }
    const historyDownload = event.target.closest("[data-history-download]");
    if (historyDownload && bridge) { bridge.downloadResult?.(bridge.getResults?.()[Number(historyDownload.getAttribute("data-history-download"))], historyDownload); return; }
    const historyUse = event.target.closest("[data-history-use]");
    if (historyUse && bridge) {
      const item = bridge.getResults?.()[Number(historyUse.dataset.historyUse)];
      void Promise.resolve(bridge.useResult?.(item, historyUse)).then((added) => { if (added) navigate(creationView()); });
      return;
    }
    if (event.target.closest("#preview-expand-button")) {
      const item = bridge?.getActiveResult?.();
      if (item) bridge.previewResult?.(item);
      else bridge?.notify?.("选择一张作品后即可放大查看");
      return;
    }
    if (event.target.closest("#preview-fullscreen-button")) {
      const stage = document.querySelector("#preview-stage");
      if (!bridge?.getActiveResult?.()) { bridge?.notify?.("选择一张作品后即可全屏预览"); return; }
      if (stage?.requestFullscreen) {
        Promise.resolve(stage.requestFullscreen()).catch(() => bridge.previewResult?.(bridge.getActiveResult()));
      } else bridge.previewResult?.(bridge.getActiveResult());
      return;
    }
    const download = event.target.closest("#download-current-button");
    if (download && !download.disabled) { bridge?.downloadResult?.(bridge.getActiveResult?.(), download); return; }
    if (event.target.closest("#workbench-settings-button")) {
      renderStatus();
      const dialog = document.querySelector("#workbench-settings-dialog");
      if (window.FireUI?.openDialog) window.FireUI.openDialog(dialog);
      else if (dialog?.showModal) dialog.showModal();
      return;
    }
    if (event.target.closest("[data-close-workbench-settings]")) {
      const dialog = document.querySelector("#workbench-settings-dialog");
      if (window.FireUI?.closeDialog) window.FireUI.closeDialog(dialog);
      else dialog?.close?.();
    }
  });

  window.fireWorkbench = { connect(api) { bridge = api; const latest = bridge.getResults?.()[0]; if (latest && !bridge.getActiveResult?.()) bridge.showResult?.(latest); navigate(activeView); }, refresh, navigate };
  window.dispatchEvent(new window.Event("fire-workbench-ready"));
})();
