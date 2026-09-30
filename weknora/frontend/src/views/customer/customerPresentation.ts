import type { CustomerProfile } from '@/api/customer'

/** Keep legacy customer fields visible while new edits use one tag list and note. */
export function customerVisibleTags(profile?: { status?: string; tags?: string[] } | null): string[] {
  return [...new Set([profile?.status, ...(profile?.tags || [])].map(value => value?.trim()).filter((value): value is string => !!value))]
}

export function customerVisibleNote(note?: string, description?: string): string {
  const savedNote = note?.trim() || ''
  const savedDescription = description?.trim() || ''
  if (!savedDescription || savedNote.includes(savedDescription)) return savedNote
  if (!savedNote) return savedDescription
  return `${savedDescription}\n\n${savedNote}`
}

export interface LegacyCustomerFields {
  profile: CustomerProfile
  description: string
  visibleTags: string[]
  visibleNote: string
}

export function customerLegacyFields(profile: CustomerProfile, description: string): LegacyCustomerFields {
  return {
    profile: { ...profile, tags: [...(profile.tags || [])] },
    description,
    visibleTags: customerVisibleTags(profile),
    visibleNote: customerVisibleNote(profile.note, description),
  }
}

/** Preserve untouched legacy values so editing another field never exceeds native limits. */
export function customerFieldsForSave(profile: CustomerProfile, legacy?: LegacyCustomerFields) {
  const tagsUnchanged = legacy && profile.tags.length === legacy.visibleTags.length
    && profile.tags.every((tag, index) => tag === legacy.visibleTags[index])
  const noteUnchanged = legacy && profile.note === legacy.visibleNote
  return {
    description: noteUnchanged ? legacy.description : '',
    profile: {
      ...profile,
      status: tagsUnchanged ? legacy.profile.status : '',
      tags: tagsUnchanged ? [...legacy.profile.tags] : profile.tags,
      note: noteUnchanged ? legacy.profile.note : profile.note,
    },
  }
}
