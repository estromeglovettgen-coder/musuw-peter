export const DIRECT_VIDEO_EXTENSIONS = ['mp4', 'mpeg', 'mov', 'webm'] as const
// Keep the proxy/application-server path for ordinary files, but never let an
// environment-level MAX_FILE_SIZE_MB increase route large videos back through
// FormData. Files above this fixed ceiling use the object-store direct path.
export const DIRECT_VIDEO_UPLOAD_THRESHOLD_BYTES = 50 * 1024 * 1024
export const MAX_VIDEO_UPLOAD_BYTES = 300_000_000

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export function directVideoContentType(file: File): string | undefined {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const expected = VIDEO_MIME_TYPES[extension]
  if (!expected) return undefined
  const reported = file.type.toLowerCase().split(';', 1)[0]
  // Drag-and-drop and some OS/browser combinations leave File.type empty.
  // The extension still gives the signed request a canonical MIME; reject
  // only an explicit conflict instead of making valid videos flaky.
  if (reported && reported !== expected && !(extension === 'mov' && reported === 'video/mov')) return undefined
  return expected
}

export function isDirectVideoUploadFile(file: File): boolean {
  return Boolean(directVideoContentType(file))
}
