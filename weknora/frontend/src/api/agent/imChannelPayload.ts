export type IMChannelMode = 'webhook' | 'websocket' | 'longpoll'
export type IMChannelOutputMode = 'stream' | 'full'
export type IMChannelSessionMode = 'user' | 'thread'

export interface IMChannelUpdatePayload {
  name: string
  mode: IMChannelMode
  output_mode: IMChannelOutputMode
  session_mode: IMChannelSessionMode
  knowledge_base_id: string
  enabled: boolean
  agent_id?: string
  credentials?: Record<string, unknown>
}

type IMChannelUpdateBase = Omit<IMChannelUpdatePayload, 'credentials'>

/** Return only credential keys whose values changed from the edit snapshot. */
export function buildIMChannelCredentialsPatch(
  initial: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(current)) {
    if (
      !Object.prototype.hasOwnProperty.call(initial, key)
      || !Object.is(initial[key], current[key])
    ) {
      patch[key] = current[key]
    }
  }
  return patch
}

/** Omit an empty credential patch so stored write-only secrets stay intact. */
export function buildIMChannelUpdatePayload(
  base: IMChannelUpdateBase,
  credentialsPatch: Record<string, unknown>,
): IMChannelUpdatePayload {
  if (Object.keys(credentialsPatch).length === 0) return { ...base }
  return { ...base, credentials: { ...credentialsPatch } }
}
