type SkillMode = 'all' | 'selected' | 'none'

export function checkedPeterSkills(mode: SkillMode, selected: string[], ready: string[]): string[] {
  if (mode === 'none') return []
  if (mode === 'all') return [...ready]
  const readyNames = new Set(ready)
  return selected.filter((name) => readyNames.has(name))
}

export function updatePeterSkills(checked: string[]): { mode: SkillMode; selected: string[] } {
  return checked.length > 0
    ? { mode: 'selected', selected: checked }
    : { mode: 'none', selected: [] }
}
