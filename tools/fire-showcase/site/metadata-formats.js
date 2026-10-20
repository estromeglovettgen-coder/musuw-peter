// Container-only metadata removal. Image streams are never decoded or encoded.
const EXIF_PREFIX = new Uint8Array([69, 120, 105, 102, 0, 0]);
const encoder = new TextEncoder();
const damaged = () => new Error("图片文件结构不完整或已损坏，请重新选择");
const bytesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const startsWith = (bytes, text) => encoder.encode(text).every((v, i) => bytes[i] === v);
const asBytes = (bytes) => bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function concat(parts) {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

async function assertSameImage(before, after) {
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", concat(before)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", concat(after)));
  if (!bytesEqual(a, b)) throw new Error("图像数据校验失败，请重新选择图片");
}

export function detectImageFormat(input) {
  const b = asBytes(input);
  if (b.length >= 8 && bytesEqual(b.subarray(0, 8), new Uint8Array([137,80,78,71,13,10,26,10]))) return "PNG";
  if (b.length >= 2 && b[0] === 255 && b[1] === 216) return "JPEG";
  if (b.length >= 12 && startsWith(b, "RIFF") && startsWith(b.subarray(8), "WEBP")) return "WebP";
  throw new Error("请选择 PNG、JPG/JPEG 或 WebP 图片");
}

// Preserve only the display orientation; discard GPS, thumbnails, software and
// all other EXIF entries. Do not rotate/re-encode the compressed image itself.
function sanitizeExif(data) {
  const prefixed = bytesEqual(data.subarray(0, 6), EXIF_PREFIX);
  const tiff = data.subarray(prefixed ? 6 : 0);
  if (tiff.length < 8) throw damaged();
  const little = tiff[0] === 73 && tiff[1] === 73;
  if (!little && !(tiff[0] === 77 && tiff[1] === 77)) throw damaged();
  const dv = view(tiff);
  if (dv.getUint16(2, little) !== 42) throw damaged();
  const ifd = dv.getUint32(4, little);
  if (ifd === 0) return null;
  if (ifd < 8 || ifd + 2 > tiff.length) throw damaged();
  const count = dv.getUint16(ifd, little);
  if (ifd + 2 + count * 12 + 4 > tiff.length) throw damaged();
  let orientation = 1;
  let seenOrientation = false;
  for (let i = 0; i < count; i++) {
    const p = ifd + 2 + i * 12;
    if (dv.getUint16(p, little) !== 0x0112) continue;
    if (seenOrientation || dv.getUint16(p + 2, little) !== 3 || dv.getUint32(p + 4, little) !== 1) throw damaged();
    seenOrientation = true;
    orientation = dv.getUint16(p + 8, little);
    if (orientation < 1 || orientation > 8) throw damaged();
  }
  if (orientation === 1) return null;
  const clean = new Uint8Array(26);
  const out = view(clean);
  clean.set([73,73,42,0,8,0,0,0,1,0]);
  out.setUint16(10, 0x0112, true);
  out.setUint16(12, 3, true);
  out.setUint32(14, 1, true);
  out.setUint16(18, orientation, true);
  return prefixed ? concat([EXIF_PREFIX, clean]) : clean;
}

function jpegSegment(marker, data) {
  const result = new Uint8Array(data.length + 4);
  result.set([255, marker]);
  view(result).setUint16(2, data.length + 2);
  result.set(data, 4);
  return result;
}

export function parseJpeg(input) {
  const bytes = asBytes(input);
  if (detectImageFormat(bytes) !== "JPEG") throw damaged();
  const segments = [{ marker: 0xd8, raw: bytes.subarray(0, 2) }];
  let pos = 2, sawFrame = false, sawScan = false, sawEnd = false;
  while (pos < bytes.length) {
    const start = pos;
    if (bytes[pos++] !== 255) throw damaged();
    while (bytes[pos] === 255) pos++;
    if (pos >= bytes.length) throw damaged();
    const marker = bytes[pos++];
    if (marker === 0xd9) {
      segments.push({ marker, raw: bytes.subarray(start, pos) });
      sawEnd = true;
      break;
    }
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) throw damaged();
    if (marker === 1) { segments.push({ marker, raw: bytes.subarray(start, pos) }); continue; }
    if (pos + 2 > bytes.length) throw damaged();
    const length = view(bytes).getUint16(pos);
    const end = pos + length;
    if (length < 2 || end > bytes.length) throw damaged();
    const data = bytes.subarray(pos + 2, end);
    const segment = { marker, data, raw: bytes.subarray(start, end), replacement: undefined };
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) {
      if (data.length < 6) throw damaged();
      sawFrame = true;
    }
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      if (marker === 0xe2 && startsWith(data, "MPF\0")) {
        throw new Error("暂不支持含多幅图像或增益图的 JPG，请先导出为普通 JPG");
      }
      const preserve = marker === 0xe0 || marker === 0xee || (marker === 0xe2 && startsWith(data, "ICC_PROFILE\0"));
      if (!preserve) segment.replacement = null;
      if (marker === 0xe1 && bytesEqual(data.subarray(0, 6), EXIF_PREFIX)) {
        const exif = sanitizeExif(data);
        segment.replacement = exif ? jpegSegment(marker, exif) : null;
        if (segment.replacement && bytesEqual(segment.replacement, segment.raw)) segment.replacement = undefined;
      }
    }
    segments.push(segment);
    pos = end;
    if (marker === 0xda) {
      if (!sawFrame || data.length < 4) throw damaged();
      sawScan = true;
      const scanStart = pos;
      let scanEnd = -1;
      while (pos < bytes.length) {
        if (bytes[pos] !== 255) { pos++; continue; }
        const boundary = pos;
        let next = pos + 1;
        while (bytes[next] === 255) next++;
        if (next >= bytes.length) throw damaged();
        if (bytes[next] === 0 || (bytes[next] >= 0xd0 && bytes[next] <= 0xd7)) { pos = next + 1; continue; }
        scanEnd = boundary;
        pos = boundary;
        break;
      }
      if (scanEnd < 0) throw damaged();
      segments.push({ marker: null, raw: bytes.subarray(scanStart, scanEnd) });
    }
  }
  if (!sawFrame || !sawScan || !sawEnd) throw damaged();
  return { segments, metadataCount: segments.filter(s => s.replacement !== undefined).length };
}

const jpegImageParts = parsed => parsed.segments.filter(s => s.marker === null || (s.marker < 0xe0 || s.marker > 0xef) && s.marker !== 0xfe).map(s => s.raw);

export async function cleanJpeg(bytes) {
  const before = parseJpeg(bytes);
  const output = concat(before.segments.map(s => s.replacement === undefined ? s.raw : s.replacement).filter(Boolean));
  const after = parseJpeg(output);
  await assertSameImage(jpegImageParts(before), jpegImageParts(after));
  if (after.metadataCount) throw new Error("元数据清理校验失败");
  return output;
}

function webpChunk(type, data) {
  const result = new Uint8Array(8 + data.length + (data.length % 2));
  result.set(encoder.encode(type));
  view(result).setUint32(4, data.length, true);
  result.set(data, 8);
  return result;
}

export function parseWebp(input) {
  const bytes = asBytes(input);
  if (detectImageFormat(bytes) !== "WebP") throw damaged();
  const limit = view(bytes).getUint32(4, true) + 8;
  if (limit < 20 || limit > bytes.length || limit % 2) throw damaged();
  const chunks = [];
  let pos = 12;
  while (pos < limit) {
    if (pos + 8 > limit) throw damaged();
    const size = view(bytes).getUint32(pos + 4, true);
    const end = pos + 8 + size + (size % 2);
    if (end > limit || (size % 2 && bytes[end - 1] !== 0)) throw damaged();
    const type = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    const data = bytes.subarray(pos + 8, pos + 8 + size);
    const chunk = { type, data, raw: bytes.subarray(pos, end), replacement: undefined };
    if (["EXIF", "XMP ", "C2PA"].includes(type)) chunk.replacement = null;
    if (type === "EXIF") {
      const exif = sanitizeExif(data);
      chunk.replacement = exif ? webpChunk(type, exif) : null;
      if (chunk.replacement && bytesEqual(chunk.replacement, chunk.raw)) chunk.replacement = undefined;
    }
    chunks.push(chunk);
    pos = end;
  }
  const extended = chunks.find(c => c.type === "VP8X");
  if (extended && (chunks[0] !== extended || extended.data.length !== 10 || chunks.filter(c => c.type === "VP8X").length !== 1)) throw damaged();
  const frames = chunks.filter(c => c.type === "ANMF");
  const still = chunks.filter(c => c.type === "VP8 " || c.type === "VP8L");
  if (frames.length) {
    if (!extended || !(extended.data[0] & 2) || chunks.filter(c => c.type === "ANIM").length !== 1 || still.length) throw damaged();
    if (chunks.find(c => c.type === "ANIM").data.length !== 6) throw damaged();
    for (const frame of frames) {
      if (frame.data.length < 24) throw damaged();
      let p = 16, images = 0;
      while (p < frame.data.length) {
        if (p + 8 > frame.data.length) throw damaged();
        const size = view(frame.data).getUint32(p + 4, true);
        const kind = String.fromCharCode(...frame.data.subarray(p, p + 4));
        if (kind === "VP8 " || kind === "VP8L") images++;
        p += 8 + size + (size % 2);
        if (p > frame.data.length) throw damaged();
      }
      if (images !== 1) throw damaged();
    }
  } else if (still.length !== 1 || (extended && extended.data[0] & 2)) throw damaged();
  for (const [type, bit] of [["EXIF",8],["XMP ",4],["ICCP",32]]) {
    const items = chunks.filter(c => c.type === type);
    if (items.length > 1 || (!!items.length !== !!(extended?.data[0] & bit))) throw damaged();
  }
  return { chunks, metadataCount: chunks.filter(c => c.replacement !== undefined).length };
}

const webpImageParts = parsed => parsed.chunks.filter(c => ["VP8 ","VP8L","ALPH","ANIM","ANMF","ICCP"].includes(c.type)).map(c => c.raw);

export async function cleanWebp(bytes) {
  const before = parseWebp(bytes);
  const kept = before.chunks.filter(c => c.replacement !== null);
  const parts = kept.map(c => {
    if (c.type !== "VP8X") return c.replacement || c.raw;
    const data = c.data.slice();
    data[0] = (data[0] & ~12) | (kept.some(c => c.type === "EXIF") ? 8 : 0) | (kept.some(c => c.type === "XMP ") ? 4 : 0);
    return webpChunk(c.type, data);
  });
  const header = new Uint8Array(12);
  header.set(encoder.encode("RIFF"));
  header.set(encoder.encode("WEBP"), 8);
  view(header).setUint32(4, 4 + parts.reduce((n,p) => n+p.length, 0), true);
  const output = concat([header, ...parts]);
  const after = parseWebp(output);
  await assertSameImage(webpImageParts(before), webpImageParts(after));
  if (after.metadataCount) throw new Error("元数据清理校验失败");
  return output;
}
