import { post, getCurrentLanguage } from '../../utils/request'
import { directVideoContentType } from '../../utils/directVideoUpload'
import i18n from '@/i18n'

interface DirectUploadPart {
  part_number: number
  method: string
  url: string
  headers?: Record<string, string>
}

interface DirectUploadIntent {
  id: string
  token: string
  multipart: boolean
  method?: string
  url?: string
  headers?: Record<string, string>
  parts?: DirectUploadPart[]
  part_size?: number
}

const DIRECT_UPLOAD_MAX_ATTEMPTS = 3
const DIRECT_UPLOAD_RETRY_BASE_MS = 250

function publicVideoUploadError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error || '')
  const key = detail.includes('300 MB') || detail.includes('300000000')
    ? 'uploadConfirm.videoTooLarge'
    : 'uploadConfirm.videoUploadFailed'
  return new Error(i18n.global.t(key))
}

function appHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept-Language': getCurrentLanguage(),
  }
  const token = localStorage.getItem('weknora_token')
  if (token) headers.Authorization = `Bearer ${token}`
  const tenantID = localStorage.getItem('weknora_selected_tenant_id')
  if (tenantID) headers['X-Tenant-ID'] = tenantID
  return headers
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs))
}

function isRetryableDirectUploadError(error: any): boolean {
  if (error?.retryable === false) return false
  const status = Number(error?.status || 0)
  // A browser network failure has status 0. Restrict HTTP retries to transient
  // responses; auth/signature/validation failures must surface immediately.
  return status === 0 || status === 408 || status === 429 || status >= 500
}

async function retryDirectControlRequest<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < DIRECT_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetryableDirectUploadError(error) || attempt + 1 >= DIRECT_UPLOAD_MAX_ATTEMPTS) throw error
      await sleep(DIRECT_UPLOAD_RETRY_BASE_MS * 2 ** attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('direct upload request failed')
}

function uploadSignedBytesOnce(
  request: { url: string; method?: string; headers?: Record<string, string> },
  bytes: Blob,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(request.method || 'PUT', request.url, true)
    Object.entries(request.headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, value))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total)
    }
    xhr.onerror = () => {
      const error: any = new Error('direct upload network error')
      error.status = xhr.status
      reject(error)
    }
    xhr.onabort = () => {
      const error: any = new Error('direct upload aborted')
      error.retryable = false
      reject(error)
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const error: any = new Error(`direct upload failed (${xhr.status})`)
        error.status = xhr.status
        reject(error)
        return
      }
      // R2/S3 expose ETag through CORS when multipart completion is enabled.
      resolve((xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '').replace(/^"|"$/g, ''))
    }
    xhr.send(bytes)
  })
}

async function uploadSignedBytes(
  request: { url: string; method?: string; headers?: Record<string, string> },
  bytes: Blob,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < DIRECT_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await uploadSignedBytesOnce(request, bytes, onProgress)
    } catch (error) {
      lastError = error
      if (!isRetryableDirectUploadError(error) || attempt + 1 >= DIRECT_UPLOAD_MAX_ATTEMPTS) throw error
      // A failed attempt's bytes are not durable. Reset that part's progress
      // before the bounded exponential backoff so aggregate progress cannot
      // claim data that still needs to be sent.
      onProgress?.(0, bytes.size)
      await sleep(DIRECT_UPLOAD_RETRY_BASE_MS * 2 ** attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('direct upload failed')
}

async function startDirectUpload(kbId: string, file: File, contentType: string): Promise<DirectUploadIntent> {
  // Every file reaching this branch is already larger than the ordinary
  // 50 MiB upload ceiling. Multipart keeps retry cost bounded to one 8 MiB
  // part and lets R2's native incomplete-upload lifecycle clean abandonment.
  const multipart = true
  const response: any = await post(`/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/uploads`, {
    file_name: file.name,
    size: file.size,
    content_type: contentType,
    kind: 'video',
    multipart,
  }, { headers: appHeaders() })
  if (!response?.success || !response.token || !response.id) throw new Error(response?.error || 'direct upload could not be started')
  return response as DirectUploadIntent
}

async function completeDirectUpload(
  kbId: string,
  intent: DirectUploadIntent,
  file: File,
  options: { tag_ids?: string[]; fileName?: string; process_config?: unknown; [key: string]: any },
): Promise<any> {
  const parts: Array<{ part_number: number; etag: string }> = []
  const total = file.size
  let uploaded = 0
  const report = (loaded: number, partTotal: number, partStart: number) => {
    const aggregate = uploaded + Math.min(loaded, partTotal)
    options.onProgress?.({ loaded: aggregate, total })
    options.onUploadProgress?.({ loaded: aggregate, total })
    void partStart
  }
  if (intent.multipart) {
    if (!intent.parts?.length) throw new Error('direct multipart response is missing parts')
    const partSize = intent.part_size || Math.ceil(file.size / intent.parts.length)
    for (let index = 0; index < intent.parts.length; index++) {
      const part = intent.parts[index]
      const start = index * partSize
      const end = Math.min(file.size, start + partSize)
      const etag = await uploadSignedBytes(part, file.slice(start, end), (loaded, partTotal) => report(loaded, partTotal, start))
      if (!etag) throw new Error('object store did not expose a multipart ETag')
      parts.push({ part_number: part.part_number, etag })
      uploaded = end
    }
  } else {
    if (!intent.url) throw new Error('direct upload response is missing URL')
    await uploadSignedBytes({ url: intent.url, method: intent.method, headers: intent.headers }, file, (loaded, partTotal) => report(loaded, partTotal, 0))
  }
  const body: Record<string, any> = {
    token: intent.token,
    knowledge_base_id: kbId,
    metadata: options.metadata,
    enable_multimodel: options.enable_multimodel,
    custom_file_name: options.fileName,
    tag_ids: options.tag_ids,
    channel: options.channel,
    process_config: typeof options.process_config === 'string' ? JSON.parse(options.process_config) : options.process_config,
    parts: intent.multipart ? parts : undefined,
  }
  // Completion is server-idempotent (exact HEAD match wins after a lost
  // response), so transient failures can retry without uploading bytes again.
  const response: any = await retryDirectControlRequest(() => post(
    `/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/uploads/${encodeURIComponent(intent.id)}/complete`,
    body,
    { headers: appHeaders() },
  ))
  if (!response?.success) throw new Error(response?.error || response?.message || 'direct upload completion failed')
  return response
}

/**
 * Upload a video directly to the KB-bound R2/S3 backend and adopt it as a
 * normal Knowledge row. Existing callers keep the same upload UI and result
 * shape; only the byte transport changes.
 */
export async function uploadVideoKnowledgeFile(
  kbId: string,
  data: { file: File; [key: string]: any },
  onProgress?: (progressEvent: any) => void,
): Promise<any> {
  const contentType = directVideoContentType(data.file)
  if (!contentType) throw new Error(i18n.global.t('uploadConfirm.videoFormatUnsupported'))
  data.onProgress = onProgress
  data.onUploadProgress = onProgress
  try {
    const intent = await startDirectUpload(kbId, data.file, contentType)
    return await completeDirectUpload(kbId, intent, data.file, data)
  } catch (error) {
    // There is deliberately no public abort endpoint: a completed token must
    // not remain a bearer delete credential. This branch always uses MPU, so
    // R2's native incomplete-multipart lifecycle bounds browser abandonment.
    throw publicVideoUploadError(error)
  }
}
