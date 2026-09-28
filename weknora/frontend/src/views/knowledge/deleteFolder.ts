type FolderDeleteOperations = {
  listKnowledgeFiles: (kbId: string, params: {
    page: number
    page_size: number
    folder_path: string
    folder_recursive: boolean
  }) => Promise<unknown>
  batchDeleteKnowledge: (kbId: string, ids: string[]) => Promise<unknown>
}

export type FolderDeleteResult = {
  /** Acknowledged by the existing asynchronous deletion endpoint, not finished. */
  submittedIds: string[]
  /** Includes the uncertain batch after a network failure; callers must refresh before retrying. */
  unconfirmedIds: string[]
  error?: unknown
}

const BATCH_SIZE = 200

/**
 * Document folders are derived from their documents' paths. Delete their
 * contents through the same batch pipeline as document selection; no separate
 * folder record or parsing-cancellation mechanism is needed.
 */
export async function deleteKnowledgeFolder(
  kbId: string,
  folderPath: string,
  operations: FolderDeleteOperations,
): Promise<FolderDeleteResult> {
  if (!kbId.trim() || !folderPath || folderPath.includes('\\') ||
    folderPath.split('/').some(segment => !segment || segment !== segment.trim() || segment.endsWith('.'))) {
    throw new Error('A non-root canonical folder path is required')
  }

  const ids: string[] = []
  const seen = new Set<string>()
  let total = 0
  let pages = 1
  // Finish enumeration before submitting anything: deleting each page as it is
  // read would shift the next offset and silently skip documents.
  for (let page = 1; page <= pages; page += 1) {
    const response = await operations.listKnowledgeFiles(kbId, {
      page,
      page_size: BATCH_SIZE,
      folder_path: folderPath,
      folder_recursive: true,
    }) as { success?: boolean; data?: Array<{ id?: string; knowledge_base_id?: string; folder_path?: string }>; total?: number }
    if (response?.success !== true || !Array.isArray(response.data) ||
      !Number.isSafeInteger(response.total) || response.total! < 0) {
      throw new Error('Failed to enumerate folder documents')
    }
    if (page === 1) {
      total = response.total!
      pages = Math.ceil(total / BATCH_SIZE)
    }
    // A changing paginated list is not a reliable deletion snapshot. Refuse
    // before any mutation rather than silently deleting only part of a folder.
    if (response.total !== total || response.data.length !== Math.min(BATCH_SIZE, total - ids.length)) {
      throw new Error('Folder contents changed; refresh and try again')
    }
    for (const item of response.data) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id) ||
        item.knowledge_base_id !== kbId || typeof item.folder_path !== 'string' ||
        !(item.folder_path === folderPath || item.folder_path.startsWith(`${folderPath}/`))) {
        throw new Error('Folder document list is inconsistent; refresh and try again')
      }
      seen.add(item.id)
      ids.push(item.id)
    }
  }

  const submittedIds: string[] = []
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE)
    try {
      const response = await operations.batchDeleteKnowledge(kbId, batch) as { success?: boolean; message?: string }
      if (response?.success !== true) throw new Error(response?.message || 'Folder deletion was not accepted')
      submittedIds.push(...batch)
    } catch (error) {
      // A later batch can fail after earlier batches have been accepted. Never
      // report full success or automatically repeat an uncertain submission.
      return { submittedIds, unconfirmedIds: ids.slice(offset), error }
    }
  }
  return { submittedIds, unconfirmedIds: [] }
}
