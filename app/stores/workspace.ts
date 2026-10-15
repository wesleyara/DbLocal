import { defineStore } from 'pinia'

export type WorkspaceTabType = 'table' | 'record' | 'query' | 'erd'

/** One step of the path walked through relations: `users › #42 Ana › orders (12)`. */
export interface TrailSegment {
  label: string
  path: string
  /** Record segments are dropped again when the record panel is closed. */
  kind: 'table' | 'record' | 'relation'
}

interface HistoryEntry {
  path: string
  trail: TrailSegment[]
}

export interface WorkspaceTab {
  id: string
  connectionId: string
  schema: string
  type: WorkspaceTabType
  title: string
  icon: string
  /** Current location of the tab: the route's full path, so the whole view is reproducible. */
  path: string
  history: HistoryEntry[]
  index: number
  trail: TrailSegment[]
  /** Set by editors with unsaved changes; closing such a tab asks first. */
  dirty: boolean
  /** A preview tab (italic title) is replaced by the next table opened from the sidebar, until it is pinned. */
  preview?: boolean
}

export interface TabMeta {
  schema: string
  type: WorkspaceTabType
  title: string
  icon: string
}

const STORAGE_KEY = 'dblocal-workspace'
const ACTIVE_KEY = 'dblocal-workspace-active'
const MAX_HISTORY = 200

const ICONS: Record<WorkspaceTabType, string> = {
  table: 'lucide:table-2',
  record: 'lucide:panel-right',
  query: 'lucide:terminal',
  erd: 'lucide:network',
}
export const tabIcon = (type: WorkspaceTabType): string => ICONS[type]

/** `/c/1/public/t/users` from `/c/1/public/t/users?f=...`. */
const pathnameOf = (path: string): string => path.split('?')[0]!
const paramOf = (path: string, name: string): string | null => new URLSearchParams(path.split('?')[1] ?? '').get(name)

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now()}${Math.random().toString(36).slice(2)}`

/**
 * Workspace tabs, per connection. Each tab owns a location (the route's full path), a back/forward
 * history and the trail of relations followed to get there. Tabs are restored after a reload; which
 * tab is active is kept per browser tab, so a deep link opened elsewhere does not steal it.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const tabs = ref<WorkspaceTab[]>([])
  const activeId = ref<string | null>(null)
  /** Segment to attach to the next navigation, set by whoever starts a relation hop. */
  let pending: TrailSegment | null = null
  /** Where the next navigation comes from, so history and trail are not rewritten by back/forward. */
  let hydrated = false

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.value))
      if (activeId.value) sessionStorage.setItem(ACTIVE_KEY, activeId.value)
    } catch {
      // storage unavailable: tabs just do not survive a reload
    }
  }

  /** Reads the saved tabs. Called once on the client. */
  function hydrate(): void {
    if (hydrated) return
    hydrated = true
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as WorkspaceTab[]
      if (Array.isArray(saved)) {
        tabs.value = saved.filter((t) => t && typeof t.id === 'string' && typeof t.path === 'string' && Array.isArray(t.history))
      }
      activeId.value = sessionStorage.getItem(ACTIVE_KEY)
    } catch {
      tabs.value = []
    }
  }

  watch([tabs, activeId], persist, { deep: true })

  const forConnection = (connectionId: string) => tabs.value.filter((t) => t.connectionId === connectionId)
  const active = computed(() => tabs.value.find((t) => t.id === activeId.value) ?? null)

  /**
   * Opens a table from the sidebar. An existing tab on that table is reused; otherwise the preview
   * tab is replaced, or a new preview tab is created. `pin` (double click) makes it a regular tab.
   * Returns the path to navigate to.
   */
  function openTable(connectionId: string, path: string, meta: TabMeta, pin = false): string {
    const list = forConnection(connectionId)
    const existing = list.find((t) => pathnameOf(t.path) === pathnameOf(path))
    if (existing) {
      activeId.value = existing.id
      if (pin) existing.preview = false
      return existing.path
    }
    const root: TrailSegment = { label: meta.title, path, kind: 'table' }
    const reusable = list.find((t) => t.preview && !t.dirty)
    if (reusable) {
      Object.assign(reusable, {
        schema: meta.schema,
        type: meta.type,
        title: meta.title,
        icon: meta.icon,
        path,
        history: [{ path, trail: [root] }],
        index: 0,
        trail: [root],
        preview: !pin,
      })
      activeId.value = reusable.id
      return path
    }
    const tab = create(connectionId, path, meta)
    tab.preview = !pin
    activeId.value = tab.id
    return path
  }

  function pin(id: string): void {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab) tab.preview = false
  }

  /** Closes every tab of a connection. */
  function closeAll(connectionId: string): void {
    tabs.value = tabs.value.filter((t) => t.connectionId !== connectionId)
    activeId.value = null
  }

  /** Marks the next navigation as a relation hop, with the breadcrumb segment it adds. */
  function expect(segment: TrailSegment): void {
    pending = segment
  }

  function create(connectionId: string, path: string, meta: TabMeta, trail?: TrailSegment[]): WorkspaceTab {
    const root: TrailSegment = { label: meta.title, path, kind: 'table' }
    const tab: WorkspaceTab = {
      id: uid(),
      connectionId,
      schema: meta.schema,
      type: meta.type,
      title: meta.title,
      icon: meta.icon,
      path,
      history: [{ path, trail: trail ?? [root] }],
      index: 0,
      trail: trail ?? [root],
      dirty: false,
    }
    tabs.value.push(tab)
    return tab
  }

  /** Opens a new tab at `path` (not activated until the route changes there; see `sync`). */
  function open(connectionId: string, path: string, meta: TabMeta, trail?: TrailSegment[]): WorkspaceTab {
    const tab = create(connectionId, path, meta, trail)
    activeId.value = tab.id
    return tab
  }

  function snapshotTrail(trail: TrailSegment[]): TrailSegment[] {
    return trail.map((s) => ({ ...s }))
  }

  /**
   * Called on every route change under a connection. Updates the active tab (or adopts / creates
   * one) and its history and trail.
   */
  function sync(connectionId: string, fullPath: string, meta: TabMeta): WorkspaceTab {
    let tab = active.value && active.value.connectionId === connectionId ? active.value : null
    if (!tab) {
      tab = forConnection(connectionId).find((t) => t.path === fullPath) ?? create(connectionId, fullPath, meta)
      activeId.value = tab.id
    }
    tab.title = meta.title
    tab.icon = meta.icon
    tab.type = meta.type
    tab.schema = meta.schema
    // Same location (a re-run of the watcher): keep `pending` for the navigation that is coming.
    if (tab.path === fullPath) return tab

    const prev = tab.history[tab.index - 1]
    const next = tab.history[tab.index + 1]
    if (!pending && prev?.path === fullPath) {
      tab.index -= 1
      tab.trail = snapshotTrail(prev.trail)
    } else if (!pending && next?.path === fullPath) {
      tab.index += 1
      tab.trail = snapshotTrail(next.trail)
    } else {
      const significant =
        pathnameOf(tab.path) !== pathnameOf(fullPath) ||
        paramOf(tab.path, 'r') !== paramOf(fullPath, 'r') ||
        paramOf(tab.path, 'rel') !== paramOf(fullPath, 'rel')
      if (pending) {
        tab.preview = false
        tab.trail = [...tab.trail, pending]
      } else if (pathnameOf(tab.path) !== pathnameOf(fullPath)) {
        tab.trail = [{ label: meta.title, path: fullPath, kind: 'table' }]
      } else if (paramOf(tab.path, 'r') && !paramOf(fullPath, 'r')) {
        // The record panel was closed: its segments go away, the table stays.
        const kept = [...tab.trail]
        while (kept.length > 1 && kept[kept.length - 1]!.kind === 'record') kept.pop()
        tab.trail = kept
      }
      const last = tab.trail[tab.trail.length - 1]
      if (last && !pending) last.path = fullPath
      if (significant) {
        tab.history = [...tab.history.slice(0, tab.index + 1), { path: fullPath, trail: snapshotTrail(tab.trail) }].slice(-MAX_HISTORY)
        tab.index = tab.history.length - 1
      } else {
        tab.history[tab.index] = { path: fullPath, trail: snapshotTrail(tab.trail) }
      }
    }
    pending = null
    tab.path = fullPath
    return tab
  }

  function canGoBack(tab: WorkspaceTab | null = active.value): boolean {
    return !!tab && tab.index > 0
  }
  function canGoForward(tab: WorkspaceTab | null = active.value): boolean {
    return !!tab && tab.index < tab.history.length - 1
  }

  /** Path to navigate to for back / forward; `sync` then recognises it and moves the index. */
  function backPath(): string | null {
    const tab = active.value
    return tab && canGoBack(tab) ? tab.history[tab.index - 1]!.path : null
  }
  function forwardPath(): string | null {
    const tab = active.value
    return tab && canGoForward(tab) ? tab.history[tab.index + 1]!.path : null
  }

  /** Jumps to a breadcrumb segment, dropping what came after it. Returns the path to navigate to. */
  function trimTrail(tabId: string, segmentIndex: number): string | null {
    const tab = tabs.value.find((t) => t.id === tabId)
    const segment = tab?.trail[segmentIndex]
    if (!tab || !segment) return null
    tab.trail = tab.trail.slice(0, segmentIndex + 1)
    pending = null
    return segment.path
  }

  function activate(id: string): string | null {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return null
    activeId.value = id
    return tab.path
  }

  /** Closes a tab. Returns the path of the tab that becomes active, or null when none is left. */
  function close(id: string): string | null {
    const index = tabs.value.findIndex((t) => t.id === id)
    if (index === -1) return null
    const tab = tabs.value[index]!
    const siblings = forConnection(tab.connectionId)
    const position = siblings.findIndex((t) => t.id === id)
    tabs.value.splice(index, 1)
    if (activeId.value !== id) return null
    const neighbour = siblings[position + 1] ?? siblings[position - 1] ?? null
    activeId.value = neighbour?.id ?? null
    return neighbour?.path ?? null
  }

  function closeOthers(id: string): void {
    const keep = tabs.value.find((t) => t.id === id)
    if (!keep) return
    tabs.value = tabs.value.filter((t) => t.connectionId !== keep.connectionId || t.id === id)
    activeId.value = id
  }

  function duplicate(id: string): WorkspaceTab | null {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return null
    const copy = create(tab.connectionId, tab.path, { schema: tab.schema, type: tab.type, title: tab.title, icon: tab.icon }, snapshotTrail(tab.trail))
    const at = tabs.value.findIndex((t) => t.id === id)
    tabs.value.splice(tabs.value.length - 1, 1)
    tabs.value.splice(at + 1, 0, copy)
    return copy
  }

  /** Moves a tab to the position of another (drag and drop). */
  function move(fromId: string, toId: string): void {
    const from = tabs.value.findIndex((t) => t.id === fromId)
    const to = tabs.value.findIndex((t) => t.id === toId)
    if (from === -1 || to === -1 || from === to) return
    const [tab] = tabs.value.splice(from, 1)
    tabs.value.splice(to, 0, tab!)
  }

  /** Neighbour tab in a direction, for ⌘⇧[ / ⌘⇧]. */
  function neighbour(connectionId: string, delta: 1 | -1): WorkspaceTab | null {
    const list = forConnection(connectionId)
    const at = list.findIndex((t) => t.id === activeId.value)
    if (list.length < 2 || at === -1) return null
    return list[(at + delta + list.length) % list.length] ?? null
  }

  return {
    tabs,
    activeId,
    active,
    hydrate,
    forConnection,
    expect,
    openTable,
    pin,
    closeAll,
    open,
    sync,
    canGoBack,
    canGoForward,
    backPath,
    forwardPath,
    trimTrail,
    activate,
    close,
    closeOthers,
    duplicate,
    move,
    neighbour,
  }
})
