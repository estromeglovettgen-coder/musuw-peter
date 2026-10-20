export const SHADOWOFF_PRESET = Object.freeze({
  maximumLongEdge: 1120,
  globalSpectrumStrength: 0.30,
  faceSpectrumStrength: 0.65,
  faceFourierWeight: 0.80,
  faceResampleWeight: 0.20,
  faceResampleScale: 0.80,
  faceFeatherRatio: 0.04330708661417323,
  landmarkProtectionStrength: 0.78,
  sharpenAmount: 0.40,
  sharpenThreshold: 3 / 255,
  shotParameter: 0.00015,
  readVariance: 0.0000015,
  randomSeed: 20260921,
  sharedNoiseWeight: 0.90,
  independentNoiseWeight: 0.43588989435406733,
  rgbNoiseMultipliers: [1.0, 0.95, 1.08],
  noiseKernelCenter: 0.80,
  noiseKernelNeighbor: 0.05,
  noiseKernelSquaredSum: 0.65,
  jpegQuality: 0.84,
});

const clamp01 = value => Math.max(0, Math.min(1, value));

export function outputDimensions(width, height, limit = SHADOWOFF_PRESET.maximumLongEdge) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("图片尺寸无效");
  }
  const longest = Math.max(width, height);
  if (longest <= limit) return { width: Math.round(width), height: Math.round(height) };
  return {
    width: Math.max(1, Math.floor((width * limit * 2 + longest) / (2 * longest))),
    height: Math.max(1, Math.floor((height * limit * 2 + longest) / (2 * longest))),
  };
}

function srgbToLinear(value) {
  const x = value / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const x = clamp01(value);
  const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function reflected(index, length) {
  if (length <= 1) return 0;
  let value = index;
  while (value < 0 || value >= length) value = value < 0 ? -value : 2 * length - value - 2;
  return value;
}

function gaussianKernel(sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = value;
    sum += value;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return { kernel, radius };
}

export function gaussianBlurRgb(source, width, height, sigma = 0.9) {
  const { kernel, radius } = gaussianKernel(sigma);
  const horizontal = new Float32Array(source.length);
  const output = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let k = -radius; k <= radius; k += 1) {
          value += source[(y * width + reflected(x + k, width)) * 3 + channel] * kernel[k + radius];
        }
        horizontal[base + channel] = value;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let k = -radius; k <= radius; k += 1) {
          value += horizontal[(reflected(y + k, height) * width + x) * 3 + channel] * kernel[k + radius];
        }
        output[base + channel] = value;
      }
    }
  }
  return output;
}

export function shapeSpectrum(source, width, height, strength) {
  const blurred = gaussianBlurRgb(source, width, height, 0.9);
  const output = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) output[i] = source[i] + strength * (blurred[i] - source[i]);
  return output;
}

function unsharp(source, width, height) {
  const blurred = gaussianBlurRgb(source, width, height, 0.6);
  const output = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    const detail = source[i] - blurred[i];
    output[i] = clamp01(source[i] + (Math.abs(detail) >= SHADOWOFF_PRESET.sharpenThreshold ? SHADOWOFF_PRESET.sharpenAmount * detail : 0));
  }
  return output;
}

function resizeRgbBilinear(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const output = new Float32Array(targetWidth * targetHeight * 3);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = ((y + 0.5) * sourceHeight) / targetHeight - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);
      for (let channel = 0; channel < 3; channel += 1) {
        const a = source[(y0 * sourceWidth + x0) * 3 + channel];
        const b = source[(y0 * sourceWidth + x1) * 3 + channel];
        const c = source[(y1 * sourceWidth + x0) * 3 + channel];
        const d = source[(y1 * sourceWidth + x1) * 3 + channel];
        output[(y * targetWidth + x) * 3 + channel] =
          (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      }
    }
  }
  return output;
}

function normalizedFace(face, width, height) {
  const source = face.boundingBox || face;
  const x = Math.max(0, Math.floor(source.x * width));
  const y = Math.max(0, Math.floor(source.y * height));
  const right = Math.min(width, Math.ceil((source.x + source.width) * width));
  const bottom = Math.min(height, Math.ceil((source.y + source.height) * height));
  const landmarks = (face.landmarks || []).map(landmark => ({
    x: landmark.x * width,
    y: landmark.y * height,
    radiusX: landmark.radiusX * width,
    radiusY: landmark.radiusY * height,
  }));
  return { x, y, width: right - x, height: bottom - y, landmarks };
}

function landmarkProtection(face, x, y) {
  let protection = 0;
  for (const landmark of face.landmarks) {
    const dx = (x - landmark.x) / Math.max(1, landmark.radiusX);
    const dy = (y - landmark.y) / Math.max(1, landmark.radiusY);
    protection = Math.max(protection, Math.exp(-0.5 * (dx * dx + dy * dy)));
  }
  return protection;
}

function applyFaceRebuild(signal, width, height, normalizedFaces) {
  const output = signal.slice();
  for (const rawFace of normalizedFaces) {
    const face = normalizedFace(rawFace, width, height);
    if (face.width < 12 || face.height < 12) continue;
    const padX = Math.round(face.width * 0.28);
    const padY = Math.round(face.height * 0.22);
    const x0 = Math.max(0, face.x - padX);
    const y0 = Math.max(0, face.y - padY);
    const x1 = Math.min(width, face.x + face.width + padX);
    const y1 = Math.min(height, face.y + face.height + padY);
    const cropWidth = x1 - x0;
    const cropHeight = y1 - y0;
    const crop = new Float32Array(cropWidth * cropHeight * 3);
    for (let y = 0; y < cropHeight; y += 1) {
      const start = ((y0 + y) * width + x0) * 3;
      crop.set(signal.subarray(start, start + cropWidth * 3), y * cropWidth * 3);
    }
    const filtered = shapeSpectrum(crop, cropWidth, cropHeight, SHADOWOFF_PRESET.faceSpectrumStrength);
    const smallWidth = Math.max(1, Math.round(cropWidth * SHADOWOFF_PRESET.faceResampleScale));
    const smallHeight = Math.max(1, Math.round(cropHeight * SHADOWOFF_PRESET.faceResampleScale));
    const sampled = resizeRgbBilinear(
      resizeRgbBilinear(crop, cropWidth, cropHeight, smallWidth, smallHeight),
      smallWidth,
      smallHeight,
      cropWidth,
      cropHeight,
    );
    const centerX = face.x + face.width / 2;
    const centerY = face.y + face.height / 2;
    const radiusX = face.width * 0.58;
    const radiusY = face.height * 0.62;
    const feather = Math.max(2, face.width * SHADOWOFF_PRESET.faceFeatherRatio);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const distance = Math.sqrt(((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2);
        const edgeWidth = feather / Math.max(radiusX, radiusY);
        let alpha = clamp01((1 - distance) / Math.max(0.001, edgeWidth));
        alpha = alpha * alpha * (3 - 2 * alpha);
        alpha *= 1 - SHADOWOFF_PRESET.landmarkProtectionStrength * landmarkProtection(face, x, y);
        if (alpha <= 0) continue;
        const local = ((y - y0) * cropWidth + (x - x0)) * 3;
        const target = (y * width + x) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          const rebuilt = SHADOWOFF_PRESET.faceFourierWeight * filtered[local + channel]
            + SHADOWOFF_PRESET.faceResampleWeight * sampled[local + channel];
          output[target + channel] = clamp01(signal[target + channel] + alpha * (rebuilt - signal[target + channel]));
        }
      }
    }
  }
  return output;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalGenerator(seed) {
  const random = mulberry32(seed);
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u = Math.max(Number.EPSILON, random());
    const v = random();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
}

function correlateNoise(source, width, height, x, y) {
  const center = source[y * width + x] * SHADOWOFF_PRESET.noiseKernelCenter;
  const neighbors = (
    source[reflected(y - 1, height) * width + x]
    + source[reflected(y + 1, height) * width + x]
    + source[y * width + reflected(x - 1, width)]
    + source[y * width + reflected(x + 1, width)]
  ) * SHADOWOFF_PRESET.noiseKernelNeighbor;
  return (center + neighbors) / Math.sqrt(SHADOWOFF_PRESET.noiseKernelSquaredSum);
}

function addCameraNoise(signal, width, height) {
  const count = width * height;
  const normal = normalGenerator(SHADOWOFF_PRESET.randomSeed);
  const common = new Float32Array(count);
  const channels = [new Float32Array(count), new Float32Array(count), new Float32Array(count)];
  for (let i = 0; i < count; i += 1) {
    common[i] = normal();
    channels[0][i] = normal();
    channels[1][i] = normal();
    channels[2][i] = normal();
  }
  const output = new Float32Array(signal.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const commonValue = correlateNoise(common, width, height, x, y);
      for (let channel = 0; channel < 3; channel += 1) {
        const index = pixel * 3 + channel;
        const variance = SHADOWOFF_PRESET.shotParameter * clamp01(signal[index]) + SHADOWOFF_PRESET.readVariance;
        const independent = correlateNoise(channels[channel], width, height, x, y);
        const noise = (SHADOWOFF_PRESET.sharedNoiseWeight * commonValue
          + SHADOWOFF_PRESET.independentNoiseWeight * independent)
          * Math.sqrt(variance)
          * SHADOWOFF_PRESET.rgbNoiseMultipliers[channel];
        output[index] = clamp01(signal[index] + noise);
      }
    }
  }
  return output;
}

export function processRgbaPixels(rgba, width, height, faces = [], onProgress = () => {}) {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new Error("图片像素数据无效");
  }
  const linear = new Float32Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    linear[pixel * 3] = srgbToLinear(rgba[pixel * 4]);
    linear[pixel * 3 + 1] = srgbToLinear(rgba[pixel * 4 + 1]);
    linear[pixel * 3 + 2] = srgbToLinear(rgba[pixel * 4 + 2]);
  }
  onProgress("global");
  const global = shapeSpectrum(linear, width, height, SHADOWOFF_PRESET.globalSpectrumStrength);
  const sharpened = unsharp(global, width, height);
  onProgress("face");
  const rebuilt = applyFaceRebuild(sharpened, width, height, faces);
  onProgress("noise");
  const noisy = addCameraNoise(rebuilt, width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    output[pixel * 4] = linearToSrgb(noisy[pixel * 3]);
    output[pixel * 4 + 1] = linearToSrgb(noisy[pixel * 3 + 1]);
    output[pixel * 4 + 2] = linearToSrgb(noisy[pixel * 3 + 2]);
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

