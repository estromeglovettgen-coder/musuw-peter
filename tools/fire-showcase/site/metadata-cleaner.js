import { detectImageFormat, parseJpeg, cleanJpeg, parseWebp, cleanWebp } from "./metadata-formats.js?v=20261001-01";
import { processWithShadowoff } from "./shadowoff-browser.js?v=20261011-01";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const REMOVABLE_CHUNKS = new Set(["caBX", "eXIf", "tEXt", "zTXt", "iTXt", "tIME", "iCCP", "pHYs", "sPLT", "hIST"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_DETECTION_MS = 3000;
const MIN_CLEANING_MS = 2000;

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function waitForMinimumDuration(startedAt, minimumMs) {
  const remainingMs = Math.max(0, minimumMs - (Date.now() - startedAt));
  if (remainingMs) await new Promise((resolve) => setTimeout(resolve, remainingMs));
}

export function parsePng(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < 33 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("请选择有效的 PNG 图片");
  }

  const chunks = [];
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("图片文件已损坏，请重新选择");

    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = readUint32(bytes, offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (expectedCrc !== actualCrc) throw new Error("图片文件已损坏，请重新选择");

    chunks.push({ type, data, raw: bytes.subarray(offset, end), removable: REMOVABLE_CHUNKS.has(type) });
    offset = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }

  if (!sawEnd || chunks[0]?.type !== "IHDR") throw new Error("请选择有效的 PNG 图片");
  return { chunks };
}

export async function cleanPng(bytes) {
  const before = parsePng(bytes);
  const beforeImageData = concatBytes(before.chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const output = concatBytes([PNG_SIGNATURE, ...before.chunks.filter((chunk) => !chunk.removable).map((chunk) => chunk.raw)]);
  const after = parsePng(output);
  const afterImageData = concatBytes(after.chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));

  if (await sha256(beforeImageData) !== await sha256(afterImageData)) {
    throw new Error("处理失败，请重新选择图片");
  }
  if (after.chunks.some((chunk) => chunk.removable)) {
    throw new Error("处理失败，请重新选择图片");
  }
  return output;
}

export function detectPngTraces(bytes) {
  return parsePng(bytes).chunks.filter((chunk) => chunk.removable).length;
}

export function inspectImage(bytes) {
  const format = detectImageFormat(bytes);
  if (format === "PNG") return { format, mime: "image/png", extension: "png", count: detectPngTraces(bytes) };
  if (format === "JPEG") return { format, mime: "image/jpeg", extension: "jpg", count: parseJpeg(bytes).metadataCount };
  return { format, mime: "image/webp", extension: "webp", count: parseWebp(bytes).metadataCount };
}

export async function cleanImage(bytes) {
  const format = detectImageFormat(bytes);
  if (format === "PNG") return cleanPng(bytes);
  if (format === "JPEG") return cleanJpeg(bytes);
  return cleanWebp(bytes);
}

function initializeMetadataCleaner() {
  const input = document.querySelector("#metadata-image-input");
  const frame = document.querySelector("#metadata-upload-frame");
  const empty = document.querySelector("#metadata-upload-empty");
  const preview = document.querySelector("#metadata-upload-preview");
  const previewImage = document.querySelector("#metadata-preview-image");
  const fileName = document.querySelector("#metadata-file-name");
  const clearButton = document.querySelector("#metadata-clear-button");
  const processButton = document.querySelector("#metadata-process-button");
  const status = document.querySelector("#metadata-cleaner-status");
  const modeInputs = [...document.querySelectorAll('input[name="metadata-mode"]')];
  if (!input || !frame || !processButton) return;

  let sourceFile = null;
  let sourceBytes = null;
  let sourceInfo = null;
  let selectionVersion = 0;
  let previewUrl = "";
  let cleanedUrl = "";
  let cleanedOutput = null;
  let phase = "empty";
  let detectedTraceCount = 0;
  let selectedMode = modeInputs.find((option) => option.checked)?.value || "mild";

  const modeCopy = {
    mild: {
      ready: (format) => `${format} · 轻度模式将保持原格式，不重新编码`,
      detected: (format, count) => `检测完毕，发现 ${count} 项可清理的附带信息 · 轻度模式下 ${format} 不重新编码`,
    },
    strong: {
      ready: (format) => `${format} · 强力模式将在本地进行像素特征处理并输出 JPG`,
      detected: (_format, count) => `检测完毕，发现 ${count} 项可清理的附带信息 · 强力模式可继续进行像素特征处理`,
    },
  };

  function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function setStatus(message = "", isError = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", isError);
  }

  function setProcessButtonLabel(label) {
    const labelElement = processButton.querySelector(".metadata-action-label");
    if (labelElement) labelElement.textContent = label;
    else processButton.textContent = label;
  }

  function resetDownload() {
    revokeUrl(cleanedUrl);
    cleanedUrl = "";
    cleanedOutput = null;
    processButton.classList.remove("is-download-ready");
  }

  function setBusy(isBusy, label = "") {
    frame.classList.toggle("is-processing", isBusy);
    frame.setAttribute("aria-busy", String(isBusy));
    input.disabled = isBusy;
    processButton.disabled = isBusy;
    if (label) setProcessButtonLabel(label);
    clearButton.disabled = isBusy;
    for (const option of modeInputs) option.disabled = isBusy;
  }

  function clearSelection() {
    selectionVersion++;
    sourceFile = null;
    sourceBytes = null;
    sourceInfo = null;
    input.value = "";
    revokeUrl(previewUrl);
    previewUrl = "";
    resetDownload();
    phase = "empty";
    detectedTraceCount = 0;
    previewImage.removeAttribute("src");
    fileName.textContent = "";
    empty.hidden = false;
    preview.hidden = true;
    clearButton.hidden = true;
    setProcessButtonLabel("开始检测");
    setBusy(false);
    processButton.disabled = true;
    setStatus();
  }

  async function loadFile(file) {
    if (!file || phase === "detecting" || phase === "cleaning") return;
    const version = ++selectionVersion;
    resetDownload();
    setStatus();
    phase = "loading";
    processButton.disabled = true;
    if (file.size > MAX_FILE_BYTES) {
      clearSelection();
      setStatus("图片不能超过 5 MB", true);
      return;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (version !== selectionVersion) return;
      const info = inspectImage(bytes);
      revokeUrl(previewUrl);
      sourceFile = file;
      sourceBytes = bytes;
      sourceInfo = info;
      previewUrl = URL.createObjectURL(file);
      previewImage.src = previewUrl;
      fileName.textContent = file.name;
      empty.hidden = true;
      preview.hidden = false;
      clearButton.hidden = false;
      phase = "ready";
      detectedTraceCount = 0;
      processButton.disabled = false;
      setProcessButtonLabel("开始检测");
      setStatus(modeCopy[selectedMode].ready(info.format));
    } catch (error) {
      if (version !== selectionVersion) return;
      clearSelection();
      setStatus(error?.message || "请选择有效的 PNG、JPG 或 WebP 图片", true);
    }
  }

  input.addEventListener("change", () => loadFile(input.files?.[0]));
  clearButton.addEventListener("click", clearSelection);
  frame.addEventListener("dragover", (event) => {
    event.preventDefault();
    frame.classList.add("is-dragover");
  });
  frame.addEventListener("dragleave", () => frame.classList.remove("is-dragover"));
  frame.addEventListener("drop", (event) => {
    event.preventDefault();
    frame.classList.remove("is-dragover");
    loadFile(event.dataTransfer?.files?.[0]);
  });

  for (const option of modeInputs) {
    option.addEventListener("change", () => {
      if (!option.checked || phase === "detecting" || phase === "cleaning") return;
      selectedMode = option.value;
      resetDownload();
      if (!sourceFile || !sourceInfo) return setStatus();
      if (phase === "download") {
        phase = "detected";
        setProcessButtonLabel("一键清除AI痕迹");
      }
      processButton.disabled = false;
      setStatus(phase === "detected"
        ? modeCopy[selectedMode].detected(sourceInfo.format, detectedTraceCount)
        : modeCopy[selectedMode].ready(sourceInfo.format));
    });
  }

  async function downloadCleanedImage() {
    if (phase === "download" && cleanedUrl && sourceFile) {
      const link = document.createElement("a");
      link.href = cleanedUrl;
      const baseName = sourceFile.name.replace(/\.[^.]+$/, "");
      link.download = selectedMode === "strong"
        ? `${baseName}-shadowoff.jpg`
        : `${baseName}-clean.${sourceInfo.extension}`;
      document.body.append(link);
      link.click();
      link.remove();
    }
  }

  async function detectTraces() {
    if (!sourceFile || !sourceBytes) return;
    resetDownload();
    setStatus();
    phase = "detecting";
    setBusy(true, "检测中…");
    const detectionStartedAt = Date.now();
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      detectedTraceCount = inspectImage(sourceBytes).count;
      await waitForMinimumDuration(detectionStartedAt, MIN_DETECTION_MS);
      phase = "detected";
      setProcessButtonLabel("一键清除AI痕迹");
      setStatus(modeCopy[selectedMode].detected(sourceInfo.format, detectedTraceCount));
    } catch (error) {
      await waitForMinimumDuration(detectionStartedAt, MIN_DETECTION_MS);
      phase = "ready";
      setProcessButtonLabel("重新检测");
      setStatus(error?.message || "检测失败，请重新选择图片", true);
    } finally {
      setBusy(false);
    }
  }

  async function cleanDetectedTraces() {
    if (phase !== "detected" || !sourceFile || !sourceBytes) return;
    resetDownload();
    setStatus();
    phase = "cleaning";
    setBusy(true, "清除中…");
    const cleaningStartedAt = Date.now();
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (selectedMode === "strong") {
        cleanedOutput = await processWithShadowoff(sourceFile, {
          onProgress(stage) {
            const labels = {
              "detect-face": "识别人脸区域中…",
              decode: "读取图片中…",
              global: "调整全图细节中…",
              face: "处理人物细节中…",
              noise: "模拟相机颗粒中…",
              encode: "生成 JPG 中…",
            };
            if (labels[stage]) setProcessButtonLabel(labels[stage]);
          },
        });
      } else {
        const cleanedBytes = await cleanImage(sourceBytes);
        cleanedOutput = {
          blob: new Blob([cleanedBytes], { type: sourceInfo.mime }),
        };
      }
      await waitForMinimumDuration(cleaningStartedAt, MIN_CLEANING_MS);
      cleanedUrl = URL.createObjectURL(cleanedOutput.blob);
      phase = "download";
      processButton.classList.add("is-download-ready");
      setProcessButtonLabel("下载图片");
      if (selectedMode === "strong") {
        const faceSummary = cleanedOutput.faceCount > 0
          ? `已自动加强 ${cleanedOutput.faceCount} 个人脸区域`
          : "已完成全图处理";
        setStatus(`强力模式处理完成 · ${cleanedOutput.width}×${cleanedOutput.height} JPG · ${faceSummary}`);
      } else {
        setStatus(`轻度模式处理完成 · 已清理可识别的附带信息 · ${sourceInfo.format} 未重新编码，图像数据校验通过`);
      }
    } catch (error) {
      await waitForMinimumDuration(cleaningStartedAt, MIN_CLEANING_MS);
      phase = "detected";
      setProcessButtonLabel("重新清除AI痕迹");
      setStatus(error?.message || "清除失败，请重新选择图片", true);
    } finally {
      setBusy(false);
    }
  }

  processButton.addEventListener("click", async () => {
    if (phase === "download") return downloadCleanedImage();
    if (phase === "detected") return cleanDetectedTraces();
    if (phase === "ready") return detectTraces();
  });

  window.addEventListener("beforeunload", () => {
    revokeUrl(previewUrl);
    revokeUrl(cleanedUrl);
  });
}

if (typeof document !== "undefined") initializeMetadataCleaner();
