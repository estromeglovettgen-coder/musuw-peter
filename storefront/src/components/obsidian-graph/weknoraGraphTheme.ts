import { OBSIDIAN_NATIVE_RENDER } from './obsidianNativeGraphContract.ts'

export interface WeknoraGraphTheme {
  background: number
  line: number
  text: number
  focused: number
  highlight: number
}

export const FALLBACK_WEKNORA_GRAPH_THEME: Readonly<WeknoraGraphTheme> = Object.freeze({
  background: OBSIDIAN_NATIVE_RENDER.background,
  line: OBSIDIAN_NATIVE_RENDER.line,
  text: OBSIDIAN_NATIVE_RENDER.text,
  focused: OBSIDIAN_NATIVE_RENDER.focused,
  highlight: OBSIDIAN_NATIVE_RENDER.highlight,
})

/** Convert a browser-resolved CSS color into the integer format Pixi expects. */
export function parseGraphThemeColor(value: string, fallback: number): number {
  const normalized = value.trim().toLowerCase()
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex) {
    const expanded = hex.length === 3
      ? hex.split('').map(character => `${character}${character}`).join('')
      : hex
    return Number.parseInt(expanded, 16)
  }

  const channels = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (!channels) return fallback
  const [red, green, blue] = channels.slice(1, 4).map(channel => (
    Math.max(0, Math.min(255, Math.round(Number(channel))))
  ))
  if (![red, green, blue].every(Number.isFinite)) return fallback
  return (red << 16) + (green << 8) + blue
}

function resolveThemeVariable(
  container: HTMLElement,
  variable: string,
  fallback: number,
): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return fallback
  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:absolute',
    'width:0',
    'height:0',
    'overflow:hidden',
    'visibility:hidden',
    `color:var(${variable})`,
  ].join(';')
  container.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return parseGraphThemeColor(resolved, fallback)
}

/** Read the active WeKnora theme; no graph data or state is involved. */
export function readWeknoraGraphTheme(container: HTMLElement): WeknoraGraphTheme {
  return {
    background: resolveThemeVariable(
      container,
      '--td-bg-color-container',
      FALLBACK_WEKNORA_GRAPH_THEME.background,
    ),
    line: resolveThemeVariable(
      container,
      '--td-component-border',
      FALLBACK_WEKNORA_GRAPH_THEME.line,
    ),
    text: resolveThemeVariable(
      container,
      '--td-text-color-primary',
      FALLBACK_WEKNORA_GRAPH_THEME.text,
    ),
    focused: resolveThemeVariable(
      container,
      '--td-brand-color',
      FALLBACK_WEKNORA_GRAPH_THEME.focused,
    ),
    highlight: resolveThemeVariable(
      container,
      '--td-brand-color-hover',
      FALLBACK_WEKNORA_GRAPH_THEME.highlight,
    ),
  }
}
