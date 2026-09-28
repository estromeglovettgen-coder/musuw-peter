import {
  clearSessionMessages,
  delSession,
  pinSession,
  unpinSession,
  updateSession,
} from '@/api/chat'

export const SESSION_MUTATION_EVENT = 'weknora:session-mutation'

export interface SessionMutationPatch {
  title?: string
  is_pinned?: boolean
  pinned_at?: string | null
}

export interface SessionMutationDetail {
  sessionId: string
  patch?: SessionMutationPatch
  messagesCleared?: boolean
  removed?: boolean
}

const pendingSessionMutationIds = new Set<string>()

function beginSessionMutation(sessionId: string): boolean {
  if (pendingSessionMutationIds.has(sessionId)) return false
  pendingSessionMutationIds.add(sessionId)
  return true
}

function endSessionMutation(sessionId: string): void {
  pendingSessionMutationIds.delete(sessionId)
}

export function notifySessionMutation(detail: SessionMutationDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SessionMutationDetail>(SESSION_MUTATION_EVENT, { detail }))
}

function ensureSuccess(response: any): any {
  if (!response?.success) {
    throw new Error(response?.message || 'session mutation failed')
  }
  return response
}

export async function renameSession(
  sessionId: string,
  title: string,
  description = '',
): Promise<any> {
  const response = ensureSuccess(await updateSession(sessionId, { title, description }))
  const nextTitle = response.data?.title || title
  notifySessionMutation({ sessionId, patch: { title: nextTitle } })
  return response.data
}

export async function setSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
  const response = ensureSuccess(pinned ? await pinSession(sessionId) : await unpinSession(sessionId))
  notifySessionMutation({
    sessionId,
    patch: {
      is_pinned: pinned,
      pinned_at: pinned ? new Date().toISOString() : null,
    },
  })
}

export async function clearSession(sessionId: string): Promise<boolean> {
  if (!beginSessionMutation(sessionId)) return false
  try {
    ensureSuccess(await clearSessionMessages(sessionId))
    notifySessionMutation({ sessionId, messagesCleared: true })
    return true
  } finally {
    endSessionMutation(sessionId)
  }
}

export async function removeSession(sessionId: string): Promise<boolean> {
  if (!beginSessionMutation(sessionId)) return false
  try {
    ensureSuccess(await delSession(sessionId))
    notifySessionMutation({ sessionId, removed: true })
    return true
  } finally {
    endSessionMutation(sessionId)
  }
}
