const WORKER_URL = "./shadowoff-worker.js?v=20261007-01";
let mediaPipeDetectorsPromise;

function normalizedBox(box, width, height) {
  return {
    x: Math.max(0, box.x / width),
    y: Math.max(0, box.y / height),
    width: Math.min(1, box.width / width),
    height: Math.min(1, box.height / height),
  };
}

function normalizedLandmarks(landmarks, width, height, box) {
  const radii = { eye: [0.11, 0.055], nose: [0.08, 0.12], mouth: [0.13, 0.06] };
  return (landmarks || []).flatMap(landmark => {
    const points = landmark.locations || [];
    if (!points.length) return [];
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const [rx, ry] = radii[landmark.type] || [0.08, 0.08];
    return [{
      x: x / width,
      y: y / height,
      radiusX: (box.width / width) * rx,
      radiusY: (box.height / height) * ry,
    }];
  });
}

function mediaPipeLandmarks(keypoints, box) {
  const radiusByIndex = [
    [0.11, 0.055],
    [0.11, 0.055],
    [0.08, 0.12],
    [0.13, 0.06],
    [0.10, 0.14],
    [0.10, 0.14],
  ];
  return (keypoints || []).map((point, index) => ({
    x: point.x,
    y: point.y,
    radiusX: (box.width / box.imageWidth) * (radiusByIndex[index]?.[0] || 0.08),
    radiusY: (box.height / box.imageHeight) * (radiusByIndex[index]?.[1] || 0.08),
  }));
}

async function mediaPipeDetectors() {
  if (!mediaPipeDetectorsPromise) {
    mediaPipeDetectorsPromise = (async () => {
      const { FaceDetector: MediaPipeFaceDetector, FilesetResolver } = await import("./vendor/mediapipe/vision_bundle.mjs");
      const wasmRoot = new URL("./vendor/mediapipe/wasm", import.meta.url).href.replace(/\/$/, "");
      const vision = await FilesetResolver.forVisionTasks(wasmRoot);
      const modelPaths = [
        new URL("./assets/models/blaze_face_short_range.tflite", import.meta.url).href,
        new URL("./assets/models/face_detection_full_range_sparse.tflite", import.meta.url).href,
      ];
      const detectors = await Promise.allSettled(
        modelPaths.map(modelPath => MediaPipeFaceDetector.createFromModelPath(vision, modelPath)),
      );
      return detectors.filter(result => result.status === "fulfilled").map(result => result.value);
    })();
  }
  return mediaPipeDetectorsPromise;
}

function boxIntersectionOverUnion(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function deduplicateFaces(faces) {
  const output = [];
  for (const face of faces.sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)) {
    if (!output.some(candidate => boxIntersectionOverUnion(candidate.boundingBox, face.boundingBox) > 0.35)) output.push(face);
  }
  return output;
}

export async function detectFacesLocally(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (typeof FaceDetector !== "undefined") {
      const detector = new FaceDetector({ fastMode: false, maxDetectedFaces: 8 });
      const detections = await detector.detect(bitmap);
      if (detections.length) {
        return detections.map(detection => ({
          boundingBox: normalizedBox(detection.boundingBox, bitmap.width, bitmap.height),
          landmarks: normalizedLandmarks(detection.landmarks, bitmap.width, bitmap.height, detection.boundingBox),
        }));
      }
    }
    const detectors = await mediaPipeDetectors();
    const detections = detectors.flatMap(detector => detector.detect(bitmap).detections || []);
    return deduplicateFaces(detections.map(detection => {
      const raw = detection.boundingBox;
      const box = {
        x: raw.originX,
        y: raw.originY,
        width: raw.width,
        height: raw.height,
        imageWidth: bitmap.width,
        imageHeight: bitmap.height,
      };
      return {
        boundingBox: normalizedBox(box, bitmap.width, bitmap.height),
        landmarks: mediaPipeLandmarks(detection.keypoints, box),
      };
    }));
  } catch {
    return [];
  } finally {
    bitmap?.close();
  }
}

export async function processWithShadowoff(file, { onProgress = () => {} } = {}) {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw new Error("当前浏览器不支持本地像素处理，请使用最新版 Chrome 或 Edge");
  }
  onProgress("detect-face");
  const faces = await detectFacesLocally(file);
  const bytes = await file.arrayBuffer();
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const worker = new Worker(WORKER_URL, { type: "module" });
  return new Promise((resolve, reject) => {
    worker.addEventListener("message", event => {
      if (event.data?.id !== id) return;
      if (event.data.type === "progress") {
        onProgress(event.data.stage);
        return;
      }
      worker.terminate();
      if (event.data.type === "error") {
        reject(new Error(event.data.message));
        return;
      }
      resolve({
        blob: new Blob([event.data.buffer], { type: "image/jpeg" }),
        width: event.data.width,
        height: event.data.height,
        faceCount: event.data.faceCount,
      });
    });
    worker.addEventListener("error", event => {
      worker.terminate();
      reject(new Error(event.message || "图片处理失败"));
    });
    worker.postMessage({ id, bytes, mime: file.type || "application/octet-stream", faces }, [bytes]);
  });
}

