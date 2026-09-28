<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin, Icon as TIcon } from 'tdesign-vue-next'
import { deleteKnowledgeBase, duplicateKnowledgeBase, togglePinKnowledgeBase } from '@/api/knowledge-base'
import { useChatResourcesStore } from '@/stores/chatResources'
import { formatStringDate } from '@/utils/index'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useOrganizationStore } from '@/stores/organization'
import { listOrganizationSharedKnowledgeBases, type SharedKnowledgeBase, type OrganizationSharedKnowledgeBaseItem, type SourceFromAgentInfo } from '@/api/organization'
import { mergeAllScopeKnowledgeBases, type OwnedKnowledgeBase, type SharedKnowledgeBaseLike } from './kbListMerge'
import KnowledgeBaseEditorModal from './KnowledgeBaseEditorModal.vue'
import KbWikiBadge from './components/KbWikiBadge.vue'
import ShareKnowledgeBaseDialog from '@/components/ShareKnowledgeBaseDialog.vue'
import ListSpaceSidebar from '@/components/ListSpaceSidebar.vue'
import ResourceOriginBadge from '@/components/ResourceOriginBadge.vue'
import { shouldShowResourceOriginBadge } from '@/utils/card-list-badge'
import ContextualGuide from '@/components/ContextualGuide.vue'
import { isContextualGuideDone, markContextualGuideDone } from '@/config/contextualGuides'
import { useI18n } from 'vue-i18n'
import { useListUrlState } from '@/composables/useListUrlState'
import { useResourcePins } from '@/composables/useResourcePins'

const router = useRouter()
const route = useRoute()
const uiStore = useUIStore()
const authStore = useAuthStore()
const orgStore = useOrganizationStore()
const chatResources = useChatResourcesStore()
const { t } = useI18n()

const defaultScope: 'all' | 'mine' = authStore.hasRole('contributor') ? 'mine' : 'all'
const { scope: spaceSelection, creator: creatorFilter } = useListUrlState({
  defaultScope,
  defaultCreator: 'all',
})

const pins = useResourcePins()
const kbFavoritesCount = computed(
  () => pins.favorites.value.filter((e) => e.type === 'kb').length
)
const kbRecentsCount = computed(
  () => pins.recents.value.filter((e) => e.type === 'kb').length
)

interface KB {
  id: string;
  name: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  pinned_at?: string;
  embedding_model_id?: string;
  summary_model_id?: string;
  type?: 'document' | 'faq';
  showMore?: boolean;
  vlm_config?: { enabled?: boolean; model_id?: string };
  extract_config?: { enabled?: boolean };
  storage_provider_config?: { provider?: string };
  storage_config?: { provider?: string; bucket_name?: string };
  question_generation_config?: { enabled?: boolean; question_count?: number };
  knowledge_count?: number;
  chunk_count?: number;
  isProcessing?: boolean;
  processing_count?: number;
  share_count?: number;
  is_pinned?: boolean;
  creator_id?: string;
  creator_name?: string;
}

const kbs = ref<KB[]>([])
const loading = ref(false)
const deleteVisible = ref(false)
const deletingKb = ref<KB | null>(null)
const currentMoreIndex = ref<number>(-1)
const highlightedKbId = ref<string | null>(null)
const highlightedCardRef = ref<HTMLElement | null>(null)
const uploadTasks = ref<UploadTaskState[]>([])
const uploadCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
let uploadRefreshTimer: ReturnType<typeof setTimeout> | null = null
const UPLOAD_CLEANUP_DELAY = 10000

const shareDialogVisible = ref(false)
const sharingKbId = ref('')
const sharingKbName = ref('')
const sharedKbs = computed<SharedKnowledgeBase[]>(() => orgStore.sharedKnowledgeBases || [])
const allKnowledgeBases = computed(() => kbs.value.length + sharedKbs.value.length)

const RESERVED_SCOPES = new Set(['all', 'mine', 'favorites', 'recents'])
const spaceSelectionOrgId = computed(() => {
  const s = spaceSelection.value
  return !!s && !RESERVED_SCOPES.has(s)
})

const sharedKbsByOrg = computed(() => {
  const orgId = spaceSelection.value
  if (orgId === 'all' || orgId === 'mine') return []
  return sharedKbs.value.filter(s => s.organization_id === orgId)
})

const spaceKbsList = ref<OrganizationSharedKnowledgeBaseItem[]>([])
const spaceKbsLoading = ref(false)

const sortedMineKbs = computed<KB[]>(() => {
  return [...kbs.value].sort((a, b) => {
    const ap = a.is_pinned ? 0 : 1
    const bp = b.is_pinned ? 0 : 1
    if (ap !== bp) return ap - bp
    if (a.is_pinned && b.is_pinned) {
      const at = a.pinned_at ? Date.parse(a.pinned_at as string) : 0
      const bt = b.pinned_at ? Date.parse(b.pinned_at as string) : 0
      if (at !== bt) return bt - at
    }
    const am = isMyKb(a) ? 0 : 1
    const bm = isMyKb(b) ? 0 : 1
    if (am !== bm) return am - bm
    const ac = a.created_at ? Date.parse(a.created_at as string) : 0
    const bc = b.created_at ? Date.parse(b.created_at as string) : 0
    return bc - ac
  })
})

const sortedSpaceKbsList = computed(() => {
  return [...spaceKbsList.value].sort((a, b) => {
    const aMine = a.is_mine ? 0 : 1
    const bMine = b.is_mine ? 0 : 1
    if (aMine !== bMine) return aMine - bMine
    const aE = isSharedKbEditable(a.permission) ? 0 : 1
    const bE = isSharedKbEditable(b.permission) ? 0 : 1
    return aE - bE
  })
})
const spaceCountByOrg = ref<Record<string, number>>({})

const sharedCountByOrg = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  sharedKbs.value.forEach(s => {
    const id = s.organization_id
    if (!id) return
    map[id] = (map[id] || 0) + 1
  })
  ;(orgStore.organizations || []).forEach(org => {
    if (map[org.id] === undefined) map[org.id] = 0
  })
  return map
})
const effectiveSharedCountByOrg = computed<Record<string, number>>(() => {
  const base = sharedCountByOrg.value
  const merged = { ...base }
  Object.keys(spaceCountByOrg.value).forEach(orgId => {
    merged[orgId] = spaceCountByOrg.value[orgId]
  })
  return merged
})

const kbResourceIndex = computed(() => {
  const map = new Map<string, { kb: any; isMine: boolean; shared?: SharedKnowledgeBase }>()
  for (const kb of kbs.value) map.set(kb.id, { kb, isMine: true })
  for (const shared of sharedKbs.value) {
    if (!shared.knowledge_base) continue
    if (!map.has(shared.knowledge_base.id)) {
      map.set(shared.knowledge_base.id, { kb: shared.knowledge_base, isMine: false, shared })
    }
  }
  return map
})

const favoritesList = computed(() => {
  return pins.favorites.value
    .filter((e) => e.type === 'kb')
    .map((e) => {
      const entry = kbResourceIndex.value.get(e.id)
      if (!entry) return null
      if (entry.isMine) return { ...entry.kb, isMine: true as const, _pinTs: e.ts }
      const s = entry.shared!
      return {
        ...entry.kb,
        isMine: false as const,
        permission: s.permission,
        shared_at: s.shared_at,
        share_id: s.share_id,
        org_name: s.org_name,
        _pinTs: e.ts,
      } as any
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
})

const recentsList = computed(() => {
  return pins.recents.value
    .filter((e) => e.type === 'kb')
    .map((e) => {
      const entry = kbResourceIndex.value.get(e.id)
      if (!entry) return null
      if (entry.isMine) return { ...entry.kb, isMine: true as const, _pinTs: e.ts }
      const s = entry.shared!
      return {
        ...entry.kb,
        isMine: false as const,
        permission: s.permission,
        shared_at: s.shared_at,
        share_id: s.share_id,
        org_name: s.org_name,
        _pinTs: e.ts,
      } as any
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
})

const EDITABLE_PERMS = new Set(['admin', 'editor'])
function isSharedKbEditable(perm: string | undefined): boolean {
  return !!perm && EDITABLE_PERMS.has(perm)
}

const showShareGroupHeaders = computed(() => true)
const tenantSectionLabelKey = computed(() =>
  authStore.hasRole('admin')
    ? 'knowledgeList.sections.tenantOthers'
    : 'knowledgeList.sections.tenantReadonly'
)
const tenantSectionIconName = computed(() =>
  authStore.hasRole('admin') ? 'usergroup' : 'browse'
)

type KbSectionKey = 'pinned' | 'mine' | 'tenantOthers' | 'sharedByMe' | 'sharedEditable' | 'sharedReadonly'
const collapsedKbSections = ref<Set<KbSectionKey>>(new Set())
const isKbSectionCollapsed = (key: KbSectionKey) => collapsedKbSections.value.has(key)
const toggleKbSection = (key: KbSectionKey) => {
  const next = new Set(collapsedKbSections.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedKbSections.value = next
}

const kbSectionOf = (kb: any): KbSectionKey => {
  if (kb?.is_pinned) return 'pinned'
  const isOwnTenant = kb?.isMine === true || (kb?.isMine !== false && kb?.permission == null)
  if (isOwnTenant) return isMyKb(kb) ? 'mine' : 'tenantOthers'
  return isSharedKbEditable(kb?.permission) ? 'sharedEditable' : 'sharedReadonly'
}

const spaceKbSectionOf = (shared: any): KbSectionKey => {
  if (shared?.is_mine) return 'sharedByMe'
  return isSharedKbEditable(shared?.permission) ? 'sharedEditable' : 'sharedReadonly'
}
const isSpaceKbCollapsed = (shared: any): boolean => isKbSectionCollapsed(spaceKbSectionOf(shared))

const emptyKbCounts = (): Record<KbSectionKey, number> => ({
  pinned: 0, mine: 0, tenantOthers: 0, sharedByMe: 0, sharedEditable: 0, sharedReadonly: 0,
})
const filteredKbSectionCounts = computed<Record<KbSectionKey, number>>(() => {
  const c = emptyKbCounts()
  filteredKnowledgeBases.value.forEach(kb => { c[kbSectionOf(kb)]++ })
  return c
})
const mineKbSectionCounts = computed<Record<KbSectionKey, number>>(() => {
  const c = emptyKbCounts()
  sortedMineKbs.value.forEach(kb => { c[kbSectionOf(kb)]++ })
  return c
})
const spaceKbSectionCounts = computed<Record<KbSectionKey, number>>(() => {
  const c = emptyKbCounts()
  sortedSpaceKbsList.value.forEach(shared => { c[spaceKbSectionOf(shared)]++ })
  return c
})

const filteredKnowledgeBases = computed(() => {
  if (spaceSelection.value === 'favorites') return favoritesList.value
  if (spaceSelection.value === 'recents') return recentsList.value
  if (spaceSelection.value === 'mine') return kbs.value.map(kb => ({ ...kb, isMine: true as const }))
  if (spaceSelection.value !== 'all') return []
  return mergeAllScopeKnowledgeBases(
    kbs.value as unknown as OwnedKnowledgeBase[],
    sharedKbs.value as unknown as SharedKnowledgeBaseLike[],
    authStore.user?.id,
  ) as unknown as Array<(KB & { isMine: true }) | (SharedKnowledgeBase['knowledge_base'] & { isMine: false; permission: string; shared_at: string; share_id: string } & any)>
})

const showKbListEmpty = computed(() => {
  if (loading.value) return false
  if (!authStore.hasRole('contributor')) return false
  if (spaceSelection.value === 'all' && filteredKnowledgeBases.value.length === 0) return true
  if (spaceSelection.value === 'mine' && kbs.value.length === 0) return true
  return false
})
const showKbListContextualGuide = computed(
  () => showKbListEmpty.value && !uiStore.showKBEditorModal,
)

interface UploadTaskState {
  uploadId: string
  kbId: string
  fileName?: string
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}
interface UploadSummary {
  kbId: string
  kbName: string
  total: number
  completed: number
  progress: number
  hasError: boolean
}

const applyKbListData = (data: any[]) => {
  kbs.value = data.map((kb: any) => ({
    ...kb,
    updated_at: kb.updated_at ? formatStringDate(new Date(kb.updated_at)) : '',
    showMore: false,
    isProcessing: kb.is_processing || false,
    processing_count: kb.processing_count || 0
  }))
}

const fetchList = (force = false) => {
  loading.value = true
  return Promise.all([
    chatResources.fetchKnowledgeBasesForList({ creator: creatorFilter.value }, force).then(applyKbListData),
    orgStore.fetchSharedKnowledgeBases({ force }),
    orgStore.fetchOrganizations({ force }),
  ]).finally(() => { loading.value = false }).then(() => {
    const counts = orgStore.resourceCounts?.knowledge_bases?.by_organization
    if (counts) spaceCountByOrg.value = { ...counts }
  })
}

watch(spaceSelection, (val) => {
  if (val === 'shared') {
    spaceSelection.value = 'all'
    return
  }
  if (val === 'all' || val === 'mine' || val === 'favorites' || val === 'recents' || !val) {
    spaceKbsList.value = []
    return
  }
  spaceKbsLoading.value = true
  listOrganizationSharedKnowledgeBases(val).then((res) => {
    if (res.success && res.data) {
      spaceKbsList.value = res.data
      spaceCountByOrg.value = { ...spaceCountByOrg.value, [val]: res.data.length }
    } else {
      spaceKbsList.value = []
    }
  }).finally(() => {
    spaceKbsLoading.value = false
  })
}, { immediate: true })

watch(creatorFilter, () => {
  fetchList(true)
})

onMounted(() => {
  fetchList().then(() => {
    const highlightKbId = route.query.highlightKbId as string
    if (highlightKbId) {
      triggerHighlightFlash(highlightKbId)
      const { highlightKbId: _drop, ...rest } = route.query
      router.replace({ query: rest })
    }
  })
  window.addEventListener('knowledgeFileUploadStart', handleUploadStartEvent as EventListener)
  window.addEventListener('knowledgeFileUploadProgress', handleUploadProgressEvent as EventListener)
  window.addEventListener('knowledgeFileUploadComplete', handleUploadCompleteEvent as EventListener)
  window.addEventListener('knowledgeFileUploaded', handleUploadFinishedEvent as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('knowledgeFileUploadStart', handleUploadStartEvent as EventListener)
  window.removeEventListener('knowledgeFileUploadProgress', handleUploadProgressEvent as EventListener)
  window.removeEventListener('knowledgeFileUploadComplete', handleUploadCompleteEvent as EventListener)
  window.removeEventListener('knowledgeFileUploaded', handleUploadFinishedEvent as EventListener)
  uploadCleanupTimers.forEach(timer => clearTimeout(timer))
  uploadCleanupTimers.clear()
  if (uploadRefreshTimer) {
    clearTimeout(uploadRefreshTimer)
    uploadRefreshTimer = null
  }
})

watch(() => route.query.highlightKbId, (newKbId) => {
  if (newKbId && typeof newKbId === 'string' && kbs.value.length > 0) {
    triggerHighlightFlash(newKbId)
    const { highlightKbId: _drop, ...rest } = route.query
    router.replace({ query: rest })
  }
})

const openMore = (index: number) => { currentMoreIndex.value = index }
const onVisibleChange = (visible: boolean) => { if (!visible) currentMoreIndex.value = -1 }
const handleSettings = (kb: KB) => { kb.showMore = false; goSettings(kb.id) }

function canManageKBCard(kb: KB): boolean {
  const userId = authStore.user?.id || ''
  if (kb.creator_id && userId && kb.creator_id === userId) return true
  return authStore.hasRole('admin')
}
function canDuplicateKBCard(kb: any): boolean {
  return authStore.hasRole('contributor') && kb.isMine !== false
}
function isMyKb(kb: { creator_id?: string }): boolean {
  const userId = authStore.user?.id || ''
  return !!(kb.creator_id && userId && kb.creator_id === userId)
}
function kbOriginVariant(kb: { creator_id?: string }): 'mine' | 'creator' {
  return isMyKb(kb) ? 'mine' : 'creator'
}
function showKbOriginBadge(kb: { creator_id?: string; creator_name?: string }): boolean {
  return shouldShowResourceOriginBadge({
    section: kbSectionOf(kb),
    variant: kbOriginVariant(kb),
    creatorName: kb.creator_name,
    showSectionHeaders: showShareGroupHeaders.value,
  })
}

const handleSettingsById = (id: string) => { goSettings(id) }
const handleDeleteById = (id: string) => {
  const kb = kbs.value.find(k => k.id === id)
  if (kb) { deletingKb.value = kb; deleteVisible.value = true }
}

const handleTogglePin = async (kb: KB) => {
  kb.showMore = false
  try {
    const res: any = await togglePinKnowledgeBase(kb.id)
    if (res.success) {
      MessagePlugin.success(res.data.is_pinned ? t('knowledgeList.pin.pinSuccess') : t('knowledgeList.pin.unpinSuccess'))
      fetchList(true)
    }
  } catch { MessagePlugin.error(t('knowledgeList.pin.failed')) }
}
const handleTogglePinById = async (id: string) => {
  try {
    const res: any = await togglePinKnowledgeBase(id)
    if (res.success) {
      MessagePlugin.success(res.data.is_pinned ? t('knowledgeList.pin.pinSuccess') : t('knowledgeList.pin.unpinSuccess'))
      fetchList(true)
    }
  } catch { MessagePlugin.error(t('knowledgeList.pin.failed')) }
}

const handleDuplicate = async (kb: KB) => { kb.showMore = false; await duplicateKB(kb.id) }
const handleDuplicateById = async (id: string) => { await duplicateKB(id) }
const duplicateKB = async (id: string) => {
  try {
    const res: any = await duplicateKnowledgeBase(id)
    if (res?.success) {
      const newKbId = res.data?.target_id || res.data?.knowledge_base?.id
      MessagePlugin.success(t('knowledgeList.messages.duplicateSuccess'))
      await fetchList(true)
      if (newKbId) triggerHighlightFlash(newKbId)
    } else MessagePlugin.error(res?.message || t('knowledgeList.messages.duplicateFailed'))
  } catch (e: any) {
    MessagePlugin.error(e?.message || t('knowledgeList.messages.duplicateFailed'))
  }
}

const handleShare = (kb: KB) => {
  kb.showMore = false
  sharingKbId.value = kb.id
  sharingKbName.value = kb.name
  shareDialogVisible.value = true
}
const handleShareSuccess = () => { fetchList(true) }
const handleSharedKbClick = (sharedKb: SharedKnowledgeBase) => {
  pins.touchRecent('kb', sharedKb.knowledge_base.id)
  router.push(`/platform/knowledge-bases/${sharedKb.knowledge_base.id}`)
}
const handleSharedKbClickFromAll = (kb: any) => {
  pins.touchRecent('kb', kb.id)
  router.push(`/platform/knowledge-bases/${kb.id}`)
}

type SharedKbDetailItem = SharedKnowledgeBase & { is_mine?: boolean; source_from_agent?: SourceFromAgentInfo }
const sharedDetailPanelVisible = ref(false)
const currentSharedKbForDetail = ref<SharedKbDetailItem | null>(null)
const closeSharedDetailPanel = () => {
  sharedDetailPanelVisible.value = false
  currentSharedKbForDetail.value = null
}
const openSharedDetailFromAll = (kb: any) => {
  const sharedKb = sharedKbs.value.find(s => s.knowledge_base.id === kb.id)
  if (sharedKb) {
    currentSharedKbForDetail.value = sharedKb
    sharedDetailPanelVisible.value = true
  }
}
const openSharedDetail = (sharedKb: SharedKbDetailItem) => {
  currentSharedKbForDetail.value = sharedKb
  sharedDetailPanelVisible.value = true
}
const agentKbStrategyText = (mode: string) => {
  if (mode === 'all') return t('knowledgeList.detail.agentKbStrategyAll')
  if (mode === 'selected') return t('knowledgeList.detail.agentKbStrategySelected')
  return t('knowledgeList.detail.agentKbStrategyNone')
}
const goToSharedKbFromPanel = () => {
  if (currentSharedKbForDetail.value) {
    router.push(`/platform/knowledge-bases/${currentSharedKbForDetail.value.knowledge_base.id}`)
    closeSharedDetailPanel()
  }
}

const handleDelete = (kb: KB) => { kb.showMore = false; deletingKb.value = kb; deleteVisible.value = true }
const confirmDelete = () => {
  if (!deletingKb.value) return
  deleteKnowledgeBase(deletingKb.value.id).then((res: any) => {
    if (res.success) {
      MessagePlugin.success(t('knowledgeList.messages.deleted'))
      deleteVisible.value = false
      deletingKb.value = null
      fetchList(true)
    } else MessagePlugin.error(res.message || t('knowledgeList.messages.deleteFailed'))
  }).catch((e: any) => {
    MessagePlugin.error(e?.message || t('knowledgeList.messages.deleteFailed'))
  })
}

const isWikiKb = (kb: unknown) =>
  !!(kb as { indexing_strategy?: { wiki_enabled?: boolean } } | null | undefined)?.indexing_strategy?.wiki_enabled

const getKbDisplayName = (kbId: string) => {
  const target = kbs.value.find(kb => kb.id === kbId)
  if (target?.name) return target.name
  return t('knowledgeList.uploadProgress.unknownKb', { id: kbId }) as string
}
const uploadSummaries = computed<UploadSummary[]>(() => {
  if (!uploadTasks.value.length) return []
  const grouped: Record<string, UploadTaskState[]> = {}
  uploadTasks.value.forEach(task => {
    const kbKey = String(task.kbId)
    if (!grouped[kbKey]) grouped[kbKey] = []
    grouped[kbKey].push(task)
  })
  return Object.entries(grouped).map(([kbId, tasks]) => {
    const total = tasks.length
    const completed = tasks.filter(task => task.status !== 'uploading').length
    const progressSum = tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0)
    const avgProgress = total === 0 ? 0 : Math.min(100, Math.max(0, Math.round(progressSum / total)))
    const hasError = tasks.some(task => task.status === 'error')
    return { kbId, kbName: getKbDisplayName(kbId), total, completed, progress: avgProgress, hasError }
  }).sort((a, b) => a.kbName.localeCompare(b.kbName))
})

const clampProgress = (value: number) => Math.min(100, Math.max(0, Math.round(value)))
const addUploadTask = (task: UploadTaskState) => {
  uploadTasks.value = [...uploadTasks.value.filter(item => item.uploadId !== task.uploadId), task]
}
const patchUploadTask = (uploadId: string, patch: Partial<UploadTaskState>) => {
  const index = uploadTasks.value.findIndex(task => task.uploadId === uploadId)
  if (index === -1) return
  const nextTasks = [...uploadTasks.value]
  nextTasks[index] = { ...nextTasks[index], ...patch }
  uploadTasks.value = nextTasks
}
const removeUploadTask = (uploadId: string) => {
  uploadTasks.value = uploadTasks.value.filter(task => task.uploadId !== uploadId)
  const timer = uploadCleanupTimers.get(uploadId)
  if (timer) { clearTimeout(timer); uploadCleanupTimers.delete(uploadId) }
}
const scheduleUploadTaskCleanup = (uploadId: string) => {
  const existing = uploadCleanupTimers.get(uploadId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => { removeUploadTask(uploadId) }, UPLOAD_CLEANUP_DELAY)
  uploadCleanupTimers.set(uploadId, timer)
}

type UploadEventDetail = {
  uploadId: string
  kbId?: string | number
  fileName?: string
  progress?: number
  status?: UploadTaskState['status']
  error?: string
}
const ensureUploadTaskEntry = (detail?: UploadEventDetail) => {
  if (!detail?.uploadId) return null
  const existing = uploadTasks.value.find(task => task.uploadId === detail.uploadId)
  if (existing) return existing
  if (!detail.kbId) return null
  const initialProgress = typeof detail.progress === 'number' ? clampProgress(detail.progress) : 0
  const newTask: UploadTaskState = {
    uploadId: detail.uploadId,
    kbId: String(detail.kbId),
    fileName: detail.fileName,
    progress: initialProgress,
    status: detail.status || 'uploading',
    error: detail.error
  }
  addUploadTask(newTask)
  return newTask
}

const handleCardClick = (kb: KB) => {
  pins.touchRecent('kb', kb.id)
  goDetail(kb.id)
}
const toggleFavoriteKb = (kbId: string, evt?: Event) => {
  evt?.stopPropagation()
  pins.toggleFavorite('kb', kbId)
}
const isKbFavorited = (kbId: string) => pins.isFavorite('kb', kbId)
const goDetail = (id: string) => { router.push(`/platform/knowledge-bases/${id}`) }
const handleCreateKnowledgeBase = () => {
  markContextualGuideDone('kbList')
  uiStore.openCreateKB('document')
}
const handleKBEditorSuccess = (kbId: string) => {
  console.log('[KnowledgeBaseList] knowledge operation success:', kbId)
  const shouldOpenDetailForUploadGuide = !isContextualGuideDone('kbDetail')
  chatResources.invalidateKnowledgeBaseDetail(kbId)
  fetchList(true).then(() => {
    if (shouldOpenDetailForUploadGuide && kbId && !uiStore.showKBEditorModal) goDetail(kbId)
    if (route.query.highlightKbId === kbId) {
      triggerHighlightFlash(kbId)
      const { highlightKbId: _drop, ...rest } = route.query
      router.replace({ query: rest })
    }
  })
}
const triggerHighlightFlash = (kbId: string) => {
  highlightedKbId.value = kbId
  nextTick(() => {
    if (highlightedCardRef.value) {
      highlightedCardRef.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setTimeout(() => { highlightedKbId.value = null }, 3000)
  })
}

const handleUploadStartEvent = (event: Event) => {
  const detail = (event as CustomEvent<UploadEventDetail>).detail
  if (!detail?.uploadId || !detail?.kbId) return
  addUploadTask({
    uploadId: detail.uploadId,
    kbId: String(detail.kbId),
    fileName: detail.fileName,
    progress: typeof detail.progress === 'number' ? clampProgress(detail.progress) : 0,
    status: 'uploading'
  })
}
const handleUploadProgressEvent = (event: Event) => {
  const detail = (event as CustomEvent<UploadEventDetail>).detail
  if (!detail?.uploadId || typeof detail.progress !== 'number') return
  if (!ensureUploadTaskEntry(detail)) return
  patchUploadTask(detail.uploadId, { progress: clampProgress(detail.progress) })
}
const handleUploadCompleteEvent = (event: Event) => {
  const detail = (event as CustomEvent<UploadEventDetail>).detail
  if (!detail?.uploadId) return
  const progress = typeof detail.progress === 'number' ? clampProgress(detail.progress) : 100
  if (!ensureUploadTaskEntry({ ...detail, progress })) return
  patchUploadTask(detail.uploadId, {
    status: detail.status || 'success',
    progress,
    error: detail.error
  })
  scheduleUploadTaskCleanup(detail.uploadId)
}
const handleUploadFinishedEvent = (event: Event) => {
  const detail = (event as CustomEvent<{ kbId?: string | number }>).detail
  if (!detail?.kbId) return
  if (uploadRefreshTimer) clearTimeout(uploadRefreshTimer)
  uploadRefreshTimer = setTimeout(() => {
    fetchList(true)
    uploadRefreshTimer = null
  }, 800)
}
</script>
