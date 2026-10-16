<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { fuzzyFilter, parsePaletteInput } from '#shared/fuzzy'
import { encodeRecord, keyLabel, tablePath } from '#shared/nav-url'
import type { ConnectionView } from '#shared/types/connection'
import type { SavedQuery } from '#shared/types/saved-queries'
import { useSchemaStore } from '~/stores/schema'
import { useQueriesStore } from '~/stores/queries'
import { useWorkspaceStore } from '~/stores/workspace'

export interface PaletteAction {
  id: string
  label: string
  icon: string
  /** Id in the shortcut registry, to show the key next to the entry. */
  shortcut?: string
  /** Extra words that also find the action. */
  keywords?: string
  run: () => void
}

interface Entry {
  key: string
  group: 'recent' | 'tables' | 'queries' | 'connections' | 'actions' | 'record'
  label: string
  detail?: string
  icon: string
  shortcut?: string
  run: () => void | Promise<void>
}

const props = defineProps<{ connectionId?: string; schema?: string; actions: PaletteAction[] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const store = useSchemaStore()
const workspace = useWorkspaceStore()
const queries = useQueriesStore()
const { format, keysOf } = useShortcuts()

const input = ref('')
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)

const saved = ref<SavedQuery[]>([])
const connections = ref<ConnectionView[]>([])

/** Fetched each time the palette opens, so a query saved a second ago is there. */
async function load(): Promise<void> {
  const [q, c] = await Promise.all([
    props.connectionId
      ? $fetch<SavedQuery[]>('/api/saved-queries', { query: { connectionId: props.connectionId } }).catch(() => [])
      : Promise.resolve([]),
    $fetch<ConnectionView[]>('/api/connections').catch(() => []),
  ])
  saved.value = q
  connections.value = c
}

watch(open, (value) => {
  if (!value) return
  input.value = ''
  active.value = 0
  void load()
  setTimeout(() => document.querySelector<HTMLInputElement>('[data-palette-input]')?.focus(), 80)
})

const close = () => (open.value = false)
const schemaName = computed(() => props.schema ?? store.schema ?? '')

function openTable(name: string): void {
  if (!props.connectionId) return
  const path = tablePath(props.connectionId, schemaName.value, name)
  const target = workspace.openTable(props.connectionId, path, {
    schema: schemaName.value,
    type: 'table',
    title: name,
    icon: 'lucide:table-2',
  })
  void navigateTo(target)
}

function openSaved(q: SavedQuery): void {
  if (!props.connectionId) return
  const qid = queries.create({ sql: q.sql, savedId: q.id, name: q.name, savedSql: q.sql })
  void navigateTo(`/c/${props.connectionId}/${encodeURIComponent(schemaName.value)}/q/${qid}`)
}

function openRecord(table: string, key: Record<string, string | number>): void {
  if (!props.connectionId) return
  const path = tablePath(props.connectionId, schemaName.value, table, { r: encodeRecord(table, key, table) })
  workspace.open(props.connectionId, path, {
    schema: schemaName.value,
    type: 'record',
    title: `${table} ${keyLabel(key)}`,
    icon: 'lucide:panel-right',
  })
  void navigateTo(path)
}

const parsed = computed(() => parsePaletteInput(input.value))

const tableEntries = computed<Entry[]>(() =>
  store.tables.map((tb) => ({
    key: `table:${tb.name}`,
    group: 'tables',
    label: tb.name,
    detail: tb.kind === 'table' ? undefined : t('tableView.view'),
    icon: tb.kind === 'table' ? 'lucide:table-2' : 'lucide:eye',
    run: () => openTable(tb.name),
  })),
)

const recentEntries = computed<Entry[]>(() => {
  if (!props.connectionId) return []
  return [...workspace.forConnection(props.connectionId)]
    .reverse()
    .filter((tab) => tab.id !== workspace.activeId)
    .slice(0, 6)
    .map((tab) => ({
      key: `recent:${tab.id}`,
      group: 'recent' as const,
      label: tab.title,
      detail: tab.schema,
      icon: tab.icon,
      run: () => {
        const path = workspace.activate(tab.id)
        if (path) void navigateTo(path)
      },
    }))
})

const queryEntries = computed<Entry[]>(() =>
  saved.value.map((q) => ({
    key: `query:${q.id}`,
    group: 'queries',
    label: q.name,
    detail: q.folder ?? undefined,
    icon: 'lucide:bookmark',
    run: () => openSaved(q),
  })),
)

const connectionEntries = computed<Entry[]>(() =>
  connections.value
    .filter((c) => c.id !== props.connectionId)
    .map((c) => ({
      key: `connection:${c.id}`,
      group: 'connections',
      label: c.name,
      detail: c.dialect,
      icon: 'lucide:database',
      run: () => void navigateTo(`/c/${c.id}`),
    })),
)

const actionEntries = computed<Entry[]>(() =>
  props.actions.map((a) => ({
    key: `action:${a.id}`,
    group: 'actions',
    label: a.label,
    detail: a.keywords,
    icon: a.icon,
    shortcut: a.shortcut,
    run: a.run,
  })),
)

/** `#users 42`: the record by primary key. While the table is still being typed it lists tables. */
const recordEntries = computed<Entry[]>(() => {
  const p = parsed.value
  if (p.mode !== 'record') return []
  const exact = store.tables.find((tb) => tb.name === p.table)
  if (!exact || p.pk === '') {
    return fuzzyFilter(p.table, tableEntries.value, (e) => e.label)
      .slice(0, 8)
      .map((e) => ({
        ...e,
        key: `rec-table:${e.label}`,
        group: 'record' as const,
        label: `#${e.label} `,
        detail: t('palette.recordHint'),
        // Completing the table name keeps the palette open, so the key can be typed next.
        run: () => {
          input.value = `#${e.label} `
          throw new KeepOpen()
        },
      }))
  }
  if (exact.primaryKey.length !== 1) {
    return [
      {
        key: 'rec-composite',
        group: 'record',
        label: t('palette.compositeKey', { table: exact.name }),
        icon: 'lucide:triangle-alert',
        run: () => openTable(exact.name),
      },
    ]
  }
  const pkName = exact.primaryKey[0]!
  const column = exact.columns.find((c) => c.name === pkName)
  const value: string | number = column?.kind === 'number' && /^-?\d+(\.\d+)?$/.test(p.pk) ? Number(p.pk) : p.pk
  return [
    {
      key: `rec:${exact.name}:${p.pk}`,
      group: 'record',
      label: t('palette.goToRecord', { table: exact.name, key: p.pk }),
      detail: pkName,
      icon: 'lucide:panel-right',
      run: () => openRecord(exact.name, { [pkName]: value }),
    },
  ]
})

class KeepOpen extends Error {}

const entries = computed<Entry[]>(() => {
  const p = parsed.value
  if (p.mode === 'record') return recordEntries.value
  if (p.mode === 'actions') return fuzzyFilter(p.term, actionEntries.value, (e) => `${e.label} ${e.detail ?? ''}`)
  if (p.term === '') return [...recentEntries.value, ...actionEntries.value]
  const pick = (list: Entry[]) => fuzzyFilter(p.term, list, (e) => `${e.label}${e.detail ? ` ${e.detail}` : ''}`).slice(0, 8)
  return [
    ...pick(tableEntries.value),
    ...pick(queryEntries.value),
    ...pick(connectionEntries.value),
    ...pick(recentEntries.value),
    ...pick(actionEntries.value),
  ]
})

const GROUP_ORDER: Entry['group'][] = ['recent', 'record', 'tables', 'queries', 'connections', 'actions']
const sections = computed(() => {
  const groups = new Map<Entry['group'], Entry[]>()
  for (const entry of entries.value) (groups.get(entry.group) ?? groups.set(entry.group, []).get(entry.group)!).push(entry)
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g)! }))
})
/** Flat order of what is on screen, for the keyboard. */
const flat = computed(() => sections.value.flatMap((s) => s.items))

watch(input, () => (active.value = 0))

function scrollActive(): void {
  void nextTick(() => listEl.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}

async function choose(entry: Entry | undefined): Promise<void> {
  if (!entry) return
  try {
    await entry.run()
  } catch (err) {
    if (err instanceof KeepOpen) return
    throw err
  }
  close()
}

function onKeydown(event: KeyboardEvent): void {
  const count = flat.value.length
  if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
    event.preventDefault()
    active.value = count ? (active.value + 1) % count : 0
    scrollActive()
  } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
    event.preventDefault()
    active.value = count ? (active.value - 1 + count) % count : 0
    scrollActive()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void choose(flat.value[active.value])
  } else if (event.key === 'Home' && event.ctrlKey) {
    active.value = 0
  }
}

const groupLabel = (g: Entry['group']) => t(`palette.groups.${g}`)
const optionId = (i: number) => `palette-option-${i}`
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
      <DialogContent
        class="fixed left-1/2 top-[14vh] z-50 flex max-h-[70vh] w-[min(40rem,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-pop"
        data-command-palette
        @keydown="onKeydown"
      >
        <DialogTitle class="sr-only">{{ t('palette.title') }}</DialogTitle>
        <DialogDescription class="sr-only">{{ t('palette.description') }}</DialogDescription>
        <div class="flex items-center gap-2 border-b border-border px-3">
          <Icon name="lucide:search" class="size-4 shrink-0 text-fg-subtle" />
          <input
            v-model="input"
            data-palette-input
            class="h-11 w-full bg-transparent text-sm text-fg outline-none! placeholder:text-fg-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            :aria-activedescendant="flat.length ? optionId(active) : undefined"
            :placeholder="t('palette.placeholder')"
            :aria-label="t('palette.title')"
            autocomplete="off"
            spellcheck="false"
          >
          <UiKbd>Esc</UiKbd>
        </div>

        <div id="palette-list" ref="listEl" role="listbox" class="min-h-0 flex-1 overflow-auto p-1">
          <p v-if="flat.length === 0" class="px-3 py-6 text-center text-sm text-fg-muted">{{ t('palette.noResults') }}</p>
          <template v-for="section in sections" :key="section.group">
            <p class="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ groupLabel(section.group) }}</p>
            <button
              v-for="entry in section.items"
              :id="optionId(flat.indexOf(entry))"
              :key="entry.key"
              type="button"
              role="option"
              :aria-selected="flat.indexOf(entry) === active"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg"
              :class="flat.indexOf(entry) === active ? 'bg-accent-soft' : 'hover:bg-surface-hover'"
              @mousemove="active = flat.indexOf(entry)"
              @click="choose(entry)"
            >
              <Icon :name="entry.icon" class="size-4 shrink-0 text-fg-muted" />
              <span class="font-data min-w-0 truncate">{{ entry.label }}</span>
              <span v-if="entry.detail" class="min-w-0 truncate text-xs text-fg-subtle">{{ entry.detail }}</span>
              <span v-if="entry.shortcut && keysOf(entry.shortcut)" class="ml-auto flex shrink-0 gap-0.5">
                <UiKbd v-for="part in format(keysOf(entry.shortcut)!)" :key="part">{{ part }}</UiKbd>
              </span>
            </button>
          </template>
        </div>

        <footer class="flex items-center gap-3 border-t border-border px-3 py-1.5 text-xs text-fg-subtle">
          <span><UiKbd>↑</UiKbd> <UiKbd>↓</UiKbd> {{ t('palette.navigate') }}</span>
          <span><UiKbd>Enter</UiKbd> {{ t('palette.select') }}</span>
          <span class="ml-auto"><UiKbd>&gt;</UiKbd> {{ t('palette.groups.actions') }} · <UiKbd>#</UiKbd> {{ t('palette.groups.record') }}</span>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
