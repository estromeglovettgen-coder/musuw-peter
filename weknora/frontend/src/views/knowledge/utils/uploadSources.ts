import { kbFileTypeVerification } from '@/utils'
import { shouldRejectKnowledgeFileType } from '@/utils/fileTypeVerification'
import {
  DIRECT_VIDEO_EXTENSIONS,
  isDirectVideoUploadFile,
  MAX_VIDEO_UPLOAD_BYTES,
} from '@/utils/directVideoUpload'

export const UPLOAD_VIDEO_EXTENSIONS: string[] = [...DIRECT_VIDEO_EXTENSIONS]
export { MAX_VIDEO_UPLOAD_BYTES }

const SOCIAL_HOSTS = new Set([
  'tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
  'xiaohongshu.com', 'www.xiaohongshu.com', 'm.xiaohongshu.com',
  'xhslink.com', 'www.xhslink.com', 'xhslink.cn', 'www.xhslink.cn',
  'instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am',
  'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com',
  'douyin.com', 'www.douyin.com', 'm.douyin.com', 'v.douyin.com',
  'iesdouyin.com', 'www.iesdouyin.com',
])

const SOCIAL_URL_PATTERN = /https?:\/\/[A-Za-z0-9][A-Za-z0-9._~:/?#[\]@!$&()*+,;=%_-]*/gi
const SOCIAL_TRAILING_PUNCTUATION = /[.,!?;:'"，。！？；：、)\]}》」』”’）】…]+$/u

/**
 * Returns true only when a pasted value contains one URL on a supported
 * social host. The backend remains the authoritative work/path classifier;
 * this conservative UI seam only decides whether provider-owned media model
 * controls should be hidden before submission.
 */
export function isSupportedSocialShareInput(input: string): boolean {
  if (!input || new TextEncoder().encode(input).length > 4096) return false
  const cleaned = input.replace(/[\u00ad\u200b\u200c\u200d\u2060\ufeff]/gu, '')
  const candidates = cleaned.match(SOCIAL_URL_PATTERN) || []
  const normalized = new Set<string>()
  for (const candidate of candidates) {
    const raw = candidate.replace(SOCIAL_TRAILING_PUNCTUATION, '')
    try {
      const parsed = new URL(raw)
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.port) {
        return false
      }
      parsed.hash = ''
      normalized.add(parsed.toString())
    } catch {
      return false
    }
  }
  if (normalized.size !== 1) return false
  const [only] = normalized
  return SOCIAL_HOSTS.has(new URL(only).hostname.toLowerCase())
}

export function getUploadFileKey(file: File): string {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
  return `${path || file.name}\0${file.size}`
}

export interface FilterUploadFilesOptions {
  supportedFileTypes?: Set<string> | string[]
  fromFolder?: boolean
  multiFile?: boolean
}

export interface FilterUploadFilesResult {
  validFiles: File[]
  skippedCount: number
  oversizedVideoCount: number
  hiddenFileCount: number
}

export function partitionFilesForConsumerPlan(
  files: File[],
  options: { videoUpload: boolean },
): { allowedFiles: File[]; blockedVideoFiles: File[] } {
  if (options.videoUpload) {
    return { allowedFiles: [...files], blockedVideoFiles: [] }
  }

  const allowedFiles: File[] = []
  const blockedVideoFiles: File[] = []
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (UPLOAD_VIDEO_EXTENSIONS.includes(extension)) blockedVideoFiles.push(file)
    else allowedFiles.push(file)
  }
  return { allowedFiles, blockedVideoFiles }
}

export function filterUploadFiles(
  files: FileList | File[],
  options: FilterUploadFilesOptions = {},
): FilterUploadFilesResult {
  const list = Array.from(files)
  const dynamicTypesRaw = options.supportedFileTypes
    ? options.supportedFileTypes instanceof Set
      ? options.supportedFileTypes
      : new Set(options.supportedFileTypes)
    : undefined
  // An empty set means the parser-engine list hasn't loaded yet (race with the
  // async fetch on mount). Treat it as "unknown" and fall back to the default
  // whitelist instead of rejecting every file as unsupported.
  const dynamicTypes = dynamicTypesRaw && dynamicTypesRaw.size > 0 ? dynamicTypesRaw : undefined

  const validFiles: File[] = []
  let skippedCount = 0
  let oversizedVideoCount = 0
  let hiddenFileCount = 0
  const multiFile = options.multiFile ?? list.length > 1
  const acceptedTypes = dynamicTypes
    ? new Set([...dynamicTypes, ...UPLOAD_VIDEO_EXTENSIONS])
    : undefined

  for (const file of list) {
    if (options.fromFolder) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      if (relativePath.split('/').some(part => part.startsWith('.'))) {
        hiddenFileCount++
        continue
      }
    }

    // The shared verifier intentionally keeps ordinary documents at 50 MiB.
    // Supported videos use the exact byte ceiling here so a 300 MB browser
    // file can reach the direct R2 transport without changing the existing UI.
    const isVideo = isDirectVideoUploadFile(file)
    const rejectedType = shouldRejectKnowledgeFileType(file.name, acceptedTypes)
    const rejectedSize = isVideo
      ? file.size > MAX_VIDEO_UPLOAD_BYTES
      : kbFileTypeVerification(file, multiFile, acceptedTypes)
    if (rejectedType || rejectedSize) {
      skippedCount++
      if (isVideo && file.size > MAX_VIDEO_UPLOAD_BYTES) oversizedVideoCount++
      continue
    }

    validFiles.push(file)
  }

  return { validFiles, skippedCount, oversizedVideoCount, hiddenFileCount }
}
