export interface ModelDefaultCandidate {
  id?: string
  type: string
  status?: string
  is_default?: boolean
}

/**
 * Pick a creation-time model: honor an active product preference when one is
 * supplied, then prefer the declared default, and finally the first active
 * model.
 */
export function selectInitialModelId(
  models: readonly ModelDefaultCandidate[],
  modelType: string,
  preferredModelId?: string,
): string | null {
  const active = models.filter(
    model => Boolean(model.id?.trim())
      && model.type === modelType
      && (!model.status || model.status === 'active'),
  )
  const preferred = preferredModelId?.trim()
  if (preferred) {
    const preferredModel = active.find(model => model.id?.trim() === preferred)
    if (preferredModel?.id) return preferredModel.id.trim()
  }
  return active.find(model => model.is_default)?.id?.trim() ?? active[0]?.id?.trim() ?? null
}
