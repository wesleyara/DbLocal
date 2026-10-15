/**
 * Pure helpers of the shortcut registry. A shortcut is a `+` joined string: modifiers (`mod`,
 * `shift`, `alt`) then one key, lower case (`mod+k`, `mod+shift+[`, `?`, `Home`, `F1`).
 * `mod` is ⌘ on macOS and Ctrl elsewhere; either is accepted when matching, so a Mac keyboard
 * with an external layout still works.
 */

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

interface Parsed {
  mod: boolean
  shift: boolean
  alt: boolean
  key: string
}

const SHIFTED: Record<string, string> = { '{': '[', '}': ']', '?': '/', '>': '.', '<': ',', '+': '=' }

export function parseShortcut(keys: string): Parsed {
  const parts = keys.split('+').map((p) => p.trim())
  // `mod++` is mod and the plus key.
  const key = keys.endsWith('++') ? '+' : parts[parts.length - 1]!
  const flags = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()))
  return { mod: flags.has('mod'), shift: flags.has('shift'), alt: flags.has('alt'), key: key.toLowerCase() }
}

/** True when the event is this shortcut. Shift is ignored for keys that are only reachable with it (`?`). */
export function matchesShortcut(event: KeyEventLike, keys: string): boolean {
  const want = parseShortcut(keys)
  const mod = event.metaKey || event.ctrlKey
  if (want.mod !== mod || want.alt !== event.altKey) return false
  const pressed = event.key.toLowerCase()
  const shiftOnly = want.key in SHIFTED
  if (!shiftOnly && want.shift !== event.shiftKey) return false
  if (pressed === want.key) return true
  // `⌘⇧[` reports `{` on most layouts.
  return SHIFTED[pressed] === want.key && (want.shift || shiftOnly)
}

const MAC_SYMBOLS: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥' }
const KEY_LABELS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: 'Enter',
  escape: 'Esc',
  delete: 'Del',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  ' ': 'Space',
  space: 'Space',
}

/** Display parts for `Kbd`, in the order a person reads them: `['⌘', '⇧', '[']` or `['Ctrl', 'Shift', '[']`. */
export function formatShortcut(keys: string, mac: boolean): string[] {
  const { mod, shift, alt, key } = parseShortcut(keys)
  const label = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key.replace(/^f(\d+)$/, 'F$1').replace(/^./, (c) => c.toUpperCase()))
  const parts: string[] = []
  if (mod) parts.push(mac ? MAC_SYMBOLS.mod! : 'Ctrl')
  if (alt) parts.push(mac ? MAC_SYMBOLS.alt! : 'Alt')
  if (shift && !(key in SHIFTED)) parts.push(mac ? MAC_SYMBOLS.shift! : 'Shift')
  parts.push(label)
  return parts
}

/** True for a field where typing is expected: shortcuts without `allowInInput` stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return !!el.closest?.('.monaco-editor')
}
