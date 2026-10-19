import type { SpotlightGuideStep } from '../types/spotlightGuide'
import { isPeterWorkspace } from './workspaceSurface'

const FIRE_GUIDE_STEPS = {
  global: new Set(['welcome', 'knowledge', 'agents', 'chat', 'settings', 'done', 'welcomeLite', 'knowledgeLite', 'agentsLite', 'chatLite', 'settingsLite', 'doneLite']),
  agentCreate: new Set(['mode', 'name', 'navKnowledge', 'knowledge', 'submit', 'modeLite', 'nameLite', 'knowledgeLite', 'submitLite']),
  kbCreate: new Set(['type', 'name', 'indexing', 'faq', 'submit', 'nameLite', 'submitLite']),
}

// Keep the native tours for other editions. Fire provisions its own model and
// parsing defaults, so its tour must never send users to hidden infrastructure.
export function workspaceGuideSteps<T extends SpotlightGuideStep>(steps: T[], tour: 'global' | 'agentCreate' | 'kbCreate', peter = isPeterWorkspace): T[] {
  return peter ? steps.filter(step => FIRE_GUIDE_STEPS[tour].has(step.key)) : steps
}
