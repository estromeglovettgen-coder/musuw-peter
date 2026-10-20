import { outputDimensions, processRgbaPixels, SHADOWOFF_PRESET } from "./shadowoff-core.js?v=20261007-01";

self.addEventListener("message", async event => {
  const { id, bytes, mime, faces = [] } = event.data || {};
  try {
    self.postMessage({ id, type: "progress", stage: "decode" });
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }), { imageOrientation: "from-image" });
    const size = outputDimensions(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const image = context.getImageData(0, 0, size.width, size.height);
    const output = processRgbaPixels(image.data, size.width, size.height, faces, stage => {
      self.postMessage({ id, type: "progress", stage });
    });
    context.putImageData(new ImageData(output, size.width, size.height), 0, 0);
    self.postMessage({ id, type: "progress", stage: "encode" });
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: SHADOWOFF_PRESET.jpegQuality });
    const buffer = await blob.arrayBuffer();
    self.postMessage({
      id,
      type: "result",
      buffer,
      width: size.width,
      height: size.height,
      faceCount: faces.length,
    }, [buffer]);
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || "图片处理失败" });
  }
});

