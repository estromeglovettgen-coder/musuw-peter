import { reactive } from 'vue'

export type FolderDocument = {
  id: string
  title?: string
  file_name?: string
  parse_status: string
  [key: string]: unknown
}

type FolderDocumentPage = {
  items: FolderDocument[]
  page: number
  hasMore: boolean
  loading: boolean
  failed: boolean
  stale: boolean
}

type ListDocuments = (kbId: string, params: {
  folder_path: string
  folder_recursive: boolean
  page: number
  page_size: number
}) => Promise<any>

/** The sidebar fetches only expanded folders, with the existing paginated API. */
export function useFolderDocuments(kbId: () => string, list: ListDocuments) {
  const pages = reactive(new Map<string, FolderDocumentPage>())

  async function load(path: string, refresh = false) {
    const targetKb = kbId()
    const previous = pages.get(path)
    if (!targetKb || (!refresh && previous?.loading)) return
    if (!refresh && previous && !previous.failed && !previous.hasMore) return
    const page = refresh ? 1 : (previous?.page ?? 0) + 1
    pages.set(path, {
      items: previous?.items ?? [], page: previous?.page ?? 0,
      hasMore: previous?.hasMore ?? true, loading: true, failed: false, stale: false,
    })
    const state = pages.get(path)!
    try {
      const response = await list(targetKb, {
        folder_path: path, folder_recursive: false, page, page_size: 50,
      })
      if (kbId() !== targetKb || pages.get(path) !== state) return
      if (response?.success === false || !Array.isArray(response?.data)) throw new Error('Folder documents unavailable')
      const items = response.data as FolderDocument[]
      state.items = page === 1 ? items : [...state.items, ...items.filter((item) => !state.items.some((existing) => existing.id === item.id))]
      state.page = page
      state.hasMore = items.length > 0 && state.items.length < Number(response.total ?? state.items.length)
    } catch {
      if (kbId() === targetKb && pages.get(path) === state) {
        state.failed = true
        state.stale = refresh
      }
    } finally {
      if (kbId() === targetKb && pages.get(path) === state) state.loading = false
    }
  }

  function invalidate() {
    pages.forEach((state) => { state.stale = true })
  }

  return { pages, load, invalidate }
}
