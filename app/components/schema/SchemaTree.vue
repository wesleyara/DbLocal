<script setup lang="ts">
import type { SchemaTable } from '#shared/types/db'
import { useSchemaStore } from '~/stores/schema'
import { useWorkspaceStore } from '~/stores/workspace'
import type { MenuItem } from '../ui/DropdownMenu.vue'

const props = defineProps<{ connectionId: string; schema?: string }>()
const { t } = useI18n()
const { number: formatNumber } = useFormat()
const { message } = useConnectionErrors()
const toast = useToast()
const store = useSchemaStore()

const query = ref('')
const expanded = ref(new Set<string>())
const active = ref<string | null>(null)
const addOpen = ref(false)
const displayTable = ref<SchemaTable | null>(null)
const displayOpen = ref(false)
const AUTO = '__auto__'
const displayChoice = ref(AUTO)

// Awaited in setup so the server renders the tree with its data; the payload then matches the client.
await store.ensure(props.connectionId, props.schema ?? null).catch(() => {})

/** Loads the schema again when the connection or schema in the URL changes. */
watch(
  () => [props.connectionId, props.schema] as const,
  ([id, name]) => store.ensure(id, name ?? null).catch(() => {}),
)

/** Subsequence match: `ord` finds `orders`, `usr` finds `users`. */
function fuzzy(name: string, q: string): boolean {
  const target = name.toLowerCase()
  let at = 0
  for (const ch of q.toLowerCase()) {
    at = target.indexOf(ch, at)
    if (at < 0) return false
    at++
  }
  return true
}

const matching = computed(() => store.tables.filter((tb) => !query.value || fuzzy(tb.name, query.value)))
const tableRows = computed(() => matching.value.filter((tb) => tb.kind === 'table'))
const viewRows = computed(() => matching.value.filter((tb) => tb.kind !== 'table'))
/** Keyboard order: the rows as they are on screen. */
const visibleOrder = computed(() => [...tableRows.value, ...viewRows.value].map((tb) => tb.name))

/** Outgoing refs point away from the table (arrow right); incoming ones point to it (arrow left). */
function relationsOf(name: string) {
  const node = store.graph?.tables[name]
  return [
    ...(node?.outgoing ?? []).map((ref) => ({ ref, incoming: false })),
    ...(node?.incoming ?? []).map((ref) => ({ ref, incoming: true })),
  ]
}

function isVirtual(name: string) {
  return store.graph?.relations.some((r) => r.virtual && (r.from.table === name || r.to.table === name)) ?? false
}

function toggle(name: string) {
  const next = new Set(expanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expanded.value = next
}

const workspace = useWorkspaceStore()

/** Single click opens the table in the preview tab; double click (`pin`) keeps it as its own tab. */
function openTable(name: string, pin = false) {
  active.value = name
  const schema = props.schema ?? store.schema ?? ''
  const path = `/c/${props.connectionId}/${encodeURIComponent(schema)}/t/${encodeURIComponent(name)}`
  const target = workspace.openTable(props.connectionId, path, { schema, type: 'table', title: name, icon: 'lucide:table-2' }, pin)
  void navigateTo(target)
}

/** Quotes identifiers the way the dialect expects. */
function quote(name: string): string {
  if (store.dialect === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

function selectFor(tb: SchemaTable): string {
  const target = store.dialect === 'sqlite' ? quote(tb.name) : `${quote(store.schema ?? '')}.${quote(tb.name)}`
  return `SELECT * FROM ${target} LIMIT 100;`
}

async function copy(text: string, done: string) {
  await navigator.clipboard.writeText(text)
  toast.push({ kind: 'success', title: done })
}

function openDisplay(tb: SchemaTable) {
  displayTable.value = tb
  displayChoice.value = store.graph?.tables[tb.name]?.displayColumn ?? AUTO
  displayOpen.value = true
}

async function saveDisplay() {
  if (!displayTable.value) return
  try {
    await store.setDisplayColumn(displayTable.value.name, displayChoice.value === AUTO ? null : displayChoice.value)
    displayOpen.value = false
    toast.push({ kind: 'success', title: t('schemaTree.saved') })
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  }
}

async function refresh() {
  try {
    await store.load(props.connectionId, props.schema ?? null, true)
    toast.push({ kind: 'success', title: t('schemaTree.refreshed') })
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  }
}

function menuFor(tb: SchemaTable): MenuItem[] {
  return [
    { label: t('schemaTree.openTable'), icon: 'lucide:table-2', onSelect: () => openTable(tb.name) },
    { label: '', separator: true },
    {
      label: t('schemaTree.copyName'),
      icon: 'lucide:copy',
      onSelect: () => copy(tb.name, t('schemaTree.nameCopied')),
    },
    {
      label: t('schemaTree.generateSelect'),
      icon: 'lucide:file-code',
      onSelect: () => copy(selectFor(tb), t('schemaTree.selectCopied')),
    },
    { label: '', separator: true },
    { label: t('schemaTree.setDisplay'), icon: 'lucide:tag', onSelect: () => openDisplay(tb) },
  ]
}

/** Arrow keys move through the tree; Enter opens the table; Left/Right collapse and expand. */
function onKeydown(e: KeyboardEvent) {
  const order = visibleOrder.value
  if (order.length === 0) return
  const current = order.indexOf(active.value ?? '')
  const name = order[current] ?? order[0]!
  let next = current
  if (e.key === 'ArrowDown') next = Math.min(order.length - 1, current + 1)
  else if (e.key === 'ArrowUp') next = Math.max(0, current - 1)
  else if (e.key === 'ArrowRight' && !expanded.value.has(name)) toggle(name)
  else if (e.key === 'ArrowLeft' && expanded.value.has(name)) toggle(name)
  else if (e.key === 'Enter') return openTable(name)
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = order.length - 1
  else return
  e.preventDefault()
  active.value = order[next] ?? name
  nextTick(() => document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(active.value!)}"]`)?.focus())
}

/**
 * Tables without a catalogue estimate (Postgres before ANALYZE, SQLite) get their count on demand,
 * the same one the grid footer uses. Views are skipped: counting one can run an expensive query.
 */
const counted = ref(new Map<string, number>())
const requested = new Set<string>()
const MAX_PARALLEL = 3

async function fetchMissingCounts(): Promise<void> {
  const schemaName = props.schema ?? store.schema ?? ''
  const pending = store.tables.filter(
    (tb) => tb.kind === 'table' && tb.rowEstimate === null && !requested.has(`${props.connectionId}|${schemaName}|${tb.name}`),
  )
  const queue = [...pending]
  const worker = async () => {
    for (let tb = queue.shift(); tb; tb = queue.shift()) {
      requested.add(`${props.connectionId}|${schemaName}|${tb.name}`)
      try {
        const res = await $fetch<{ count: number }>(`/api/c/${props.connectionId}/tables/${encodeURIComponent(tb.name)}/count`, {
          method: 'POST',
          body: { schema: schemaName, filter: null, exact: false },
        })
        counted.value = new Map(counted.value).set(tb.name, res.count)
      } catch {
        // No count is not an error for the sidebar: the row simply shows none.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker))
}

watch(
  () => store.tables,
  () => {
    counted.value = new Map()
    void fetchMissingCounts()
  },
  { immediate: true },
)

function rowsLabel(tb: SchemaTable): string | null {
  if (tb.rowEstimate === null) {
    const exact = counted.value.get(tb.name)
    return exact === undefined ? null : t('schemaTree.rowsExact', { count: formatNumber(exact, { notation: 'compact', maximumFractionDigits: 1 }) })
  }
  return t('schemaTree.rowsEstimate', { count: formatNumber(tb.rowEstimate, { notation: 'compact', maximumFractionDigits: 1 }) })
}

const CARDINALITY_KEY = {
  'many-to-one': 'manyToOne',
  'one-to-many': 'oneToMany',
  'one-to-one': 'oneToOne',
  'many-to-many': 'manyToMany',
} as const
function cardinalityLabel(c: keyof typeof CARDINALITY_KEY): string {
  return t(`virtualRelations.cardinalityOptions.${CARDINALITY_KEY[c]}`)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col border-t border-border">
    <div class="flex items-center gap-1 px-2 pt-2">
      <UiInput v-model="query" type="search" :placeholder="t('schemaTree.filter')" :aria-label="t('schemaTree.filter')" class="h-6" />
      <UiIconButton icon="lucide:refresh-cw" :label="t('schemaTree.refresh')" size="sm" :disabled="store.loading" @click="refresh" />
      <UiIconButton icon="lucide:link-2" :label="t('schemaTree.addVirtual')" size="sm" @click="addOpen = true" />
    </div>

    <p v-if="store.error" class="px-2 pt-2 text-xs text-danger" role="alert">{{ message(store.error) }}</p>

    <div
      role="tree"
      :aria-label="t('schemaTree.label')"
      class="min-h-0 flex-1 overflow-auto px-1 py-1"
      @keydown="onKeydown"
    >
      <template v-for="section in [{ key: 'tables', rows: tableRows, label: t('schemaTree.tables') }, { key: 'views', rows: viewRows, label: t('schemaTree.views') }]" :key="section.key">
        <div v-if="section.rows.length" class="px-1.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
          {{ section.label }} <span class="font-data">{{ section.rows.length }}</span>
        </div>

        <div v-for="tb in section.rows" :key="tb.name">
          <UiContextMenu :items="menuFor(tb)">
            <div
              role="treeitem"
              :aria-expanded="expanded.has(tb.name)"
              :aria-selected="active === tb.name"
              :tabindex="(active ?? visibleOrder[0]) === tb.name ? 0 : -1"
              :data-row-key="tb.name"
              class="group flex h-7 cursor-default items-center gap-1.5 rounded-sm px-1 text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent"
              :class="active === tb.name && 'bg-surface'"
              @click="openTable(tb.name)"
              @dblclick="openTable(tb.name, true)"
              @focus="active = tb.name"
            >
              <button
                type="button"
                tabindex="-1"
                class="grid size-4 shrink-0 place-items-center text-fg-subtle"
                :aria-label="expanded.has(tb.name) ? t('common.collapse') : t('common.expand')"
                @click.stop="toggle(tb.name)"
              >
                <Icon name="lucide:chevron-right" class="size-3.5 transition-transform" :class="expanded.has(tb.name) && 'rotate-90'" />
              </button>
              <Icon :name="tb.kind === 'table' ? 'lucide:table-2' : 'lucide:eye'" class="size-3.5 shrink-0 text-fg-subtle" />
              <span class="font-data min-w-0 flex-1 truncate">{{ tb.name }}</span>
              <span v-if="isVirtual(tb.name)" class="size-1.5 shrink-0 rounded-full bg-accent" :title="t('schemaTree.virtual')" />
              <span v-if="rowsLabel(tb)" class="font-data shrink-0 text-xs text-fg-subtle">{{ rowsLabel(tb) }}</span>
            </div>
          </UiContextMenu>

          <div v-if="expanded.has(tb.name)" role="group" class="mb-1 ml-5 border-l border-border pl-2">
            <p class="pt-1 pb-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">{{ t('schemaTree.columns') }}</p>
            <ul class="grid gap-px">
              <li v-for="col in tb.columns" :key="col.name" class="flex h-6 items-center gap-1.5 text-xs" :title="col.isPrimaryKey ? t('schemaTree.primaryKey') : undefined">
                <Icon v-if="col.isPrimaryKey" name="lucide:key-round" class="size-3 shrink-0 text-warning" :aria-label="t('schemaTree.primaryKey')" />
                <span v-else class="size-3 shrink-0" />
                <span class="font-data truncate text-fg">{{ col.name }}</span>
                <span class="font-data ml-auto shrink-0 truncate text-fg-subtle">{{ col.nativeType }}</span>
                <span class="sr-only">{{ col.nullable ? t('schemaTree.nullable') : t('schemaTree.notNull') }}</span>
              </li>
            </ul>

            <p class="pt-2 pb-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">{{ t('schemaTree.relations') }}</p>
            <p v-if="relationsOf(tb.name).length === 0" class="pb-1 text-xs text-fg-subtle">{{ t('schemaTree.noRelations') }}</p>
            <ul v-else class="grid gap-px pb-1">
              <li
                v-for="{ ref, incoming } in relationsOf(tb.name)"
                :key="`${incoming ? 'in' : 'out'}:${ref.relationId}:${ref.name}`"
                class="flex h-6 items-center gap-1.5 text-xs"
                :class="ref.virtual && 'rounded-sm border border-dashed border-accent/50 px-1'"
                :title="cardinalityLabel(ref.cardinality)"
              >
                <Icon :name="ref.virtual ? 'lucide:link-2' : incoming ? 'lucide:arrow-left' : 'lucide:arrow-right'" class="size-3 shrink-0 text-fg-subtle" />
                <span class="font-data truncate text-fg">{{ ref.name }}</span>
                <span class="font-data ml-auto shrink-0 truncate text-fg-subtle">{{ ref.target }}</span>
              </li>
            </ul>
          </div>
        </div>
      </template>

      <p v-if="store.tables.length === 0 && !store.loading" class="px-2 py-4 text-xs text-fg-subtle">{{ t('schemaTree.noTables') }}</p>
      <p v-else-if="matching.length === 0" class="px-2 py-4 text-xs text-fg-subtle">{{ t('schemaTree.noMatches') }}</p>
    </div>

    <UiDialog v-model:open="displayOpen" :title="t('schemaTree.displayTitle', { table: displayTable?.name ?? '' })" :description="t('schemaTree.displayHint')">
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ t('schemaTree.displayColumn') }}
        <UiSelect
          :model-value="displayChoice"
          :options="[{ value: AUTO, label: t('schemaTree.automatic') }, ...(displayTable?.columns ?? []).map((c) => ({ value: c.name, label: c.name }))]"
          @update:model-value="(v) => v && (displayChoice = v)"
        />
      </label>
      <template #footer>
        <UiButton variant="secondary" @click="displayOpen = false">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="primary" @click="saveDisplay">{{ t('common.save') }}</UiButton>
      </template>
    </UiDialog>

    <SchemaVirtualRelationsDialog v-model:open="addOpen" />
  </div>
</template>
