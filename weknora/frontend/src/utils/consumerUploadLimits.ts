import type { ConsumerEntitlement } from '@/api/entitlement'

type UploadLimits = Pick<
  ConsumerEntitlement,
  'storage_bytes' | 'storage_used' | 'max_documents_per_kb'
>

type SizedUpload = { size?: number }

export function exceedsConsumerStorageQuota(
  entitlement: Pick<UploadLimits, 'storage_bytes' | 'storage_used'> | null,
  files: SizedUpload[] = [],
): boolean {
  if (!entitlement) return false
  const quota = Number(entitlement.storage_bytes)
  const used = Number(entitlement.storage_used)
  if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(used)) return false
  const incoming = files.reduce((total, file) => total + Math.max(0, Number(file.size) || 0), 0)
  if (files.length === 0) return Math.max(0, used) >= quota
  return Math.max(0, used) + incoming > quota
}

export function exceedsConsumerDocumentLimit(
  entitlement: Pick<UploadLimits, 'max_documents_per_kb'> | null,
  currentDocuments: number | null,
  incomingDocuments: number,
): boolean {
  if (!entitlement || currentDocuments === null) return false
  const limit = Number(entitlement.max_documents_per_kb)
  if (!Number.isFinite(limit) || limit <= 0) return false
  return Math.max(0, currentDocuments) + Math.max(0, incomingDocuments) > limit
}
