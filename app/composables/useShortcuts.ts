import { formatShortcut, isTypingTarget, matchesShortcut } from '#shared/shortcuts'

/** Where a shortcut applies; the cheat sheet groups by it. */
export type ShortcutContext = 'global' | 'navigation' | 'grid' | 'editor'

export interface ShortcutDef {
  /** Stable id, `domain.action`. Registering the same id again replaces the entry. */
  id: string
  /** `mod+k`, `mod+shift+[`, `?`, `Home` (see `shared/shortcuts.ts`). */
  keys: string
  /** i18n key of the description, shown in the cheat sheet and the palette. */
  description: string
  context: ShortcutContext
  /** Fires inside inputs and the editor too (⌘K, ⌘S, ⌘Enter). */
  allowInInput?: boolean
  /**
   * Runs from the global dispatcher. Entries without it document a key that a component handles
   * itself (the grid, the editor), so the cheat sheet still lists it.
   */
  run?: (event: KeyboardEvent) => void
  /** Return false to let the key through (nothing to save, no connection open...). */
  when?: () => boolean
}

/** One registry for the whole app: the dispatcher, the cheat sheet and the palette all read it. */
const registry = reactive(new Map<string, ShortcutDef>())

export function registerShortcut(def: ShortcutDef): () => void {
  registry.set(def.id, def)
  return () => {
    if (registry.get(def.id) === def) registry.delete(def.id)
  }
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)

const ORDER: ShortcutContext[] = ['global', 'navigation', 'grid', 'editor']

/** Handles a keydown against the registry. Exported for tests; the layout installs it on `window`. */
export function dispatchShortcut(event: KeyboardEvent): boolean {
  const typing = isTypingTarget(event.target)
  for (const def of registry.values()) {
    if (!def.run || !matchesShortcut(event, def.keys)) continue
    if (typing && !def.allowInInput) continue
    if (def.when && !def.when()) continue
    def.run(event)
    return true
  }
  return false
}

export function useShortcuts() {
  const list = computed(() => [...registry.values()])
  const grouped = computed(() =>
    ORDER.map((context) => ({ context, items: list.value.filter((s) => s.context === context) })).filter((g) => g.items.length > 0),
  )
  /** Display parts for `Kbd`, ⌘ / ⇧ on macOS and Ctrl / Shift elsewhere. */
  const format = (keys: string): string[] => formatShortcut(keys, isMac())
  /** The shortcut registered under an id, for showing next to a palette entry. */
  const keysOf = (id: string): string | null => registry.get(id)?.keys ?? null
  return { list, grouped, format, keysOf }
}

/** Installs the dispatcher for the life of a component (the layout). */
export function useShortcutDispatcher(): void {
  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (dispatchShortcut(event)) event.preventDefault()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}

/** Registers shortcuts for the life of a component. */
export function useShortcutsRegistration(defs: ShortcutDef[]): void {
  const cleanups: (() => void)[] = []
  onMounted(() => defs.forEach((d) => cleanups.push(registerShortcut(d))))
  onBeforeUnmount(() => cleanups.splice(0).forEach((c) => c()))
}
