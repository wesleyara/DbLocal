<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { ConnectionMode, VueFlow, useVueFlow, type Connection, type Edge, type Node } from '@vue-flow/core'
import type { ErdLayout } from '#shared/schemas/erd'
import {
  ERD_COMPACT_ZOOM,
  buildErd,
  directNeighbours,
  edgeSides,
  handleId,
  neighbourhood,
  parseHandle,
  tableHeight,
  usablePositions,
  type ErdNote,
  type ErdTable,
  type Point,
} from '#shared/erd'
import { tablePath } from '#shared/nav-url'
import type { Cardinality } from '#shared/types/db'
import { useSchemaStore } from '~/stores/schema'
import { useWorkspaceStore } from '~/stores/workspace'
import { buildErdSvg, type ErdSvgColors } from '#shared/erd-svg'
import { saveBlob } from '~/composables/useDownload'
import { autoLayout } from './layout'
import { ERD_UI, type ErdUiState } from './state'
import ErdEdge from './ErdEdge.vue'
import ErdNoteNode from './ErdNoteNode.vue'
import ErdTableNode from './ErdTableNode.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

const props = defineProps<{ connectionId: string; schema: string; focus: string | null; hops: number }>()
const emit = defineEmits<{ 'update:focus': [table: string | null]; 'update:hops': [hops: number] }>()

const { t } = useI18n()
const toast = useToast()
const store = useSchemaStore()
const workspace = useWorkspaceStore()
const flow = useVueFlow()

const model = computed(() =>
  store.snapshot ? buildErd(store.snapshot, store.graph) : { tables: [] as ErdTable[], edges: [] },
)
const tableById = computed(() => new Map(model.value.tables.map((tb) => [tb.id, tb])))

/** Tables on screen: all of them, or the neighbourhood of the focused table. */
const visible = computed<ErdTable[]>(() => {
  const all = model.value.tables
  if (!props.focus || !tableById.value.has(props.focus)) return all
  const keep = neighbourhood(model.value.edges, props.focus, props.hops)
  return all.filter((tb) => keep.has(tb.id))
})

// ---- shared UI state (selection, hover, semantic zoom) ----------------------------------------
const ui = reactive<ErdUiState>({
  compact: false,
  selected: null,
  neighbours: new Set<string>(),
  hoverEdge: null,
  hoverColumns: new Set<string>(),
  connecting: false,
  editingNote: null,
})
provide(ERD_UI, ui)

function select(table: string | null): void {
  ui.selected = table
  ui.neighbours = table ? directNeighbours(model.value.edges, table) : new Set()
}

function hoverEdge(id: string | null): void {
  ui.hoverEdge = id
  const edge = id ? model.value.edges.find((e) => e.id === id) : null
  ui.hoverColumns = edge
    ? new Set([`${edge.source}.${edge.sourceColumn}`, `${edge.target}.${edge.targetColumn}`])
    : new Set()
}

flow.onViewportChange(({ zoom }) => {
  const compact = zoom < ERD_COMPACT_ZOOM
  if (compact !== ui.compact) ui.compact = compact
})

// ---- positions: saved ones win, otherwise elkjs -----------------------------------------------
const saved = ref<Record<string, Point>>({})
const autoCache = new Map<string, Record<string, Point>>()
const layouting = ref(false)
const positions = shallowRef<Record<string, Point>>({})

const sizeOf = (tb: ErdTable) => ({ width: tb.width, height: tableHeight(tb) })

async function computePositions(): Promise<void> {
  const tables = visible.value
  const ids = tables.map((tb) => tb.id)
  const mine = usablePositions(saved.value, ids)
  if (ids.length === 0) {
    positions.value = {}
    return
  }
  if (Object.keys(mine).length === ids.length) {
    positions.value = mine
    return
  }
  const key = ids.join('|')
  let auto = autoCache.get(key)
  if (!auto) {
    layouting.value = true
    try {
      const set = new Set(ids)
      auto = await autoLayout({
        nodes: tables.map((tb) => ({ id: tb.id, ...sizeOf(tb) })),
        edges: model.value.edges.filter((e) => set.has(e.source) && set.has(e.target)).map((e) => ({ id: e.id, source: e.source, target: e.target })),
      })
      autoCache.set(key, auto)
    } catch {
      toast.push({ kind: 'error', title: t('erd.layoutFailed') })
      auto = Object.fromEntries(ids.map((id, i) => [id, { x: (i % 6) * 320, y: Math.floor(i / 6) * 360 }]))
    } finally {
      layouting.value = false
    }
  }
  // Positions the user set win over the automatic ones, table by table.
  positions.value = { ...auto, ...mine }
}

function buildEdges(): Edge[] {
  const set = new Set(visible.value.map((tb) => tb.id))
  const out: Edge[] = []
  for (const e of model.value.edges) {
    if (!set.has(e.source) || !set.has(e.target)) continue
    const a = positions.value[e.source]
    const b = positions.value[e.target]
    if (!a || !b) continue
    const sides = edgeSides(a.x, tableById.value.get(e.source)?.width ?? 248, b.x, tableById.value.get(e.target)?.width ?? 248, e.source === e.target)
    const shown = (table: string, column: string) => (tableById.value.get(table)?.columns.some((c) => c.name === column) ? column : '')
    out.push({
      id: e.id,
      type: 'erd',
      source: e.source,
      target: e.target,
      sourceHandle: handleId(shown(e.source, e.sourceColumn), sides.source),
      targetHandle: handleId(shown(e.target, e.targetColumn), sides.target),
      data: { sourceEnd: e.sourceEnd, targetEnd: e.targetEnd, virtual: e.virtual, name: e.name, hover: hoverEdge },
    })
  }
  return out
}

/** Note nodes get a prefixed id, so they never clash with a table name. */
const NOTE_PREFIX = 'note:'
const noteNodeId = (id: string) => `${NOTE_PREFIX}${id}`
const isNoteNode = (id: string) => id.startsWith(NOTE_PREFIX)

function buildNodes(): Node[] {
  const tables: Node[] = visible.value.map((tb) => ({
    id: tb.id,
    type: 'table',
    position: positions.value[tb.id] ?? { x: 0, y: 0 },
    data: { table: tb },
  }))
  const comments: Node[] = notes.value.map((note) => ({
    id: noteNodeId(note.id),
    type: 'note',
    position: { x: note.x, y: note.y },
    data: { note, update: updateNote, resize: resizeNote, remove: removeNote },
    connectable: false,
    zIndex: 1,
  }))
  return [...tables, ...comments]
}

let fitNext = true
async function render(): Promise<void> {
  await computePositions()
  const measured = flow.getNodes.value.length > 0
  flow.setNodes(buildNodes())
  flow.setEdges(buildEdges())
  // Nodes that existed before are measured already, so `onNodesInitialized` may not fire again.
  if (measured && fitNext) {
    await nextTick()
    requestAnimationFrame(() => {
      if (!fitNext) return
      fitNext = false
      void flow.fitView({ padding: 0.1, duration: 200 })
    })
  }
}

// Fit once the nodes have been measured (before that every node has no size and the fit is wrong).
flow.onNodesInitialized(() => {
  if (!fitNext) return
  fitNext = false
  void flow.fitView({ padding: 0.1, duration: 0 })
})

const loaded = ref(false)
async function loadSaved(): Promise<void> {
  try {
    const res = await $fetch<ErdLayout>(`/api/c/${props.connectionId}/erd-layout`, { query: { schema: props.schema } })
    saved.value = res.positions
  } catch {
    saved.value = {}
  }
  loaded.value = true
}

// ---- notes: free comments on the diagram, saved per connection + schema -------------------------
const notes = ref<ErdNote[]>([])
let notesTimer: ReturnType<typeof setTimeout> | null = null

async function loadNotes(): Promise<void> {
  try {
    const res = await $fetch<{ notes: ErdNote[] }>(`/api/c/${props.connectionId}/erd-notes`, { query: { schema: props.schema } })
    notes.value = res.notes
  } catch {
    notes.value = []
  }
}

function saveNotesSoon(): void {
  if (notesTimer) clearTimeout(notesTimer)
  notesTimer = setTimeout(async () => {
    try {
      await $fetch(`/api/c/${props.connectionId}/erd-notes`, {
        method: 'PUT',
        body: { schema: props.schema, notes: notes.value.filter((n) => n.text.trim()) },
      })
    } catch {
      toast.push({ kind: 'error', title: t('erd.notesSaveFailed') })
    }
  }, 400)
}

function setNotes(next: ErdNote[]): void {
  notes.value = next
  flow.setNodes(buildNodes())
  saveNotesSoon()
}

function updateNote(id: string, text: string): void {
  setNotes(notes.value.map((n) => (n.id === id ? { ...n, text } : n)))
}

function resizeNote(id: string, width: number): void {
  setNotes(notes.value.map((n) => (n.id === id ? { ...n, width } : n)))
}

function removeNote(id: string): void {
  if (ui.editingNote === id) ui.editingNote = null
  setNotes(notes.value.filter((n) => n.id !== id))
}

/** A new empty note in the middle of the view, opened for typing (dropped again if left empty). */
function addNote(): void {
  const rect = flow.vueFlowRef.value?.getBoundingClientRect()
  const centre = rect ? flow.project({ x: rect.width / 2, y: rect.height / 2 }) : { x: 0, y: 0 }
  const note: ErdNote = { id: crypto.randomUUID(), x: Math.round(centre.x - 120), y: Math.round(centre.y - 40), text: '' }
  notes.value = [...notes.value, note]
  flow.setNodes(buildNodes())
  ui.editingNote = note.id
}

await Promise.all([loadSaved(), loadNotes()])
onMounted(() => void render())
watch(
  () => `${visible.value.map((tb) => tb.id).join('|')}#${model.value.edges.length}`,
  () => {
    fitNext = true
    void render()
  },
)
watch(
  () => [props.focus, props.hops],
  () => {
    fitNext = true
  },
)

// ---- dragging: positions are saved per connection + schema ------------------------------------
let saveTimer: ReturnType<typeof setTimeout> | null = null
const dirty = new Map<string, Point>()

function queueSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const batch = Object.fromEntries(dirty)
    dirty.clear()
    if (!Object.keys(batch).length) return
    try {
      await $fetch(`/api/c/${props.connectionId}/erd-layout`, {
        method: 'PUT',
        body: { schema: props.schema, positions: batch },
      })
    } catch {
      toast.push({ kind: 'error', title: t('erd.saveFailed') })
    }
  }, 400)
}

function onNodeDragStop({ nodes }: { nodes: { id: string }[] }): void {
  const movedNotes = new Map<string, Point>()
  for (const n of flow.getNodes.value) {
    if (isNoteNode(n.id)) movedNotes.set(n.id.slice(NOTE_PREFIX.length), { x: Math.round(n.position.x), y: Math.round(n.position.y) })
  }
  if (nodes.some((n) => isNoteNode(n.id))) {
    notes.value = notes.value.map((n) => ({ ...n, ...movedNotes.get(n.id) }))
    saveNotesSoon()
  }
  const tableNodes = nodes.filter((n) => !isNoteNode(n.id))
  if (!tableNodes.length) return

  const next = { ...positions.value }
  for (const n of flow.getNodes.value) {
    if (!isNoteNode(n.id)) next[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
  }
  positions.value = next
  // With a filter on, every shown table is saved so the subset keeps the arrangement on reload.
  const ids = props.focus ? visible.value.map((tb) => tb.id) : tableNodes.map((n) => n.id)
  for (const id of ids) {
    const p = next[id]
    if (p) {
      dirty.set(id, p)
      saved.value = { ...saved.value, [id]: p }
    }
  }
  flow.setEdges(buildEdges())
  queueSave()
}

async function resetLayout(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  dirty.clear()
  try {
    await $fetch(`/api/c/${props.connectionId}/erd-layout`, { method: 'DELETE', query: { schema: props.schema } })
  } catch {
    toast.push({ kind: 'error', title: t('erd.saveFailed') })
    return
  }
  saved.value = {}
  autoCache.clear()
  fitNext = true
  await render()
  toast.push({ kind: 'success', title: t('erd.layoutReset') })
}

// ---- interactions ------------------------------------------------------------------------------
function onNodeClick({ node }: { node: { id: string } }): void {
  if (isNoteNode(node.id)) return
  select(ui.selected === node.id ? null : node.id)
}

function openNode({ node }: { node: { id: string } }): void {
  if (isNoteNode(node.id)) return
  const path = tablePath(props.connectionId, props.schema, node.id)
  const target = workspace.openTable(props.connectionId, path, {
    schema: props.schema,
    type: 'table',
    title: node.id,
    icon: 'lucide:table-2',
  }, true)
  void navigateTo(target)
}

const search = ref('')
const searchOpen = ref(false)
const matches = computed(() => {
  const q = search.value.trim().toLowerCase()
  const all = model.value.tables.map((tb) => tb.id)
  return (q ? all.filter((n) => n.toLowerCase().includes(q)) : all).slice(0, 8)
})

function closeSearchSoon(): void {
  setTimeout(() => (searchOpen.value = false), 120)
}

async function goTo(table: string): Promise<void> {
  search.value = ''
  searchOpen.value = false
  if (props.focus && !visible.value.some((tb) => tb.id === table)) {
    emit('update:focus', null)
    await nextTick()
    await render()
  }
  select(table)
  void flow.fitView({ nodes: [table], duration: 350, maxZoom: 1.1, padding: 1.2 })
}

const hopOptions = [1, 2, 3, 4].map((n) => ({ value: String(n), label: t('erd.hopsOption', { count: n }) }))

// ---- virtual relation by dragging a column onto another ---------------------------------------
const pendingLink = ref<{ fromTable: string; fromColumn: string; toTable: string; toColumn: string } | null>(null)
const linkOpen = ref(false)
const linkCardinality = ref<Cardinality>('many-to-one')
const linkCardinalityModel = computed<string>({
  get: () => linkCardinality.value,
  set: (v) => (linkCardinality.value = v as Cardinality),
})
const linkName = ref('')
const linkSaving = ref(false)

function onConnect(c: Connection): void {
  const from = parseHandle(c.sourceHandle)
  const to = parseHandle(c.targetHandle)
  if (!from?.column || !to?.column) {
    toast.push({ kind: 'warning', title: t('erd.dropOnColumn') })
    return
  }
  pendingLink.value = { fromTable: c.source, fromColumn: from.column, toTable: c.target, toColumn: to.column }
  linkCardinality.value = 'many-to-one'
  linkName.value = ''
  linkOpen.value = true
}

async function saveLink(): Promise<void> {
  const link = pendingLink.value
  if (!link) return
  linkSaving.value = true
  try {
    await store.addVirtual({
      schema: props.schema,
      name: linkName.value.trim() || null,
      fromTable: link.fromTable,
      fromColumns: [link.fromColumn],
      toTable: link.toTable,
      toColumns: [link.toColumn],
      cardinality: linkCardinality.value,
    })
    linkOpen.value = false
    toast.push({ kind: 'success', title: t('virtualRelations.saved') })
  } catch (err) {
    toast.push({ kind: 'error', title: t('erd.linkFailed'), description: String((err as { data?: { statusMessage?: string } })?.data?.statusMessage ?? '') })
  } finally {
    linkSaving.value = false
  }
}

const cardinalityOptions = computed(() => [
  { value: 'many-to-one', label: t('virtualRelations.cardinalityOptions.manyToOne') },
  { value: 'one-to-many', label: t('virtualRelations.cardinalityOptions.oneToMany') },
  { value: 'one-to-one', label: t('virtualRelations.cardinalityOptions.oneToOne') },
])

// ---- export ------------------------------------------------------------------------------------
const exporting = ref(false)

function tokenColors(): ErdSvgColors {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    bg: v('--bg', '#ffffff'),
    surface: v('--surface', '#f4f4f5'),
    header: v('--bg-subtle', '#fafafa'),
    border: v('--border-strong', '#d4d4d8'),
    fg: v('--fg', '#18181b'),
    muted: v('--fg-muted', '#52525b'),
    subtle: v('--fg-subtle', '#71717a'),
    accent: v('--accent', '#3b5bdb'),
    warning: v('--warning', '#b45309'),
    note: v('--warning-soft', 'rgb(180 83 9 / 0.12)'),
  }
}

function rasterise(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(width * scale, 16000)
      canvas.height = Math.min(height * scale, 16000)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png')
    }
    img.onerror = () => reject(new Error('image'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Draws the diagram as it is now (filter and positions included) into a standalone SVG, then PNG if asked. */
async function exportImage(format: 'png' | 'svg'): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const set = new Set(visible.value.map((tb) => tb.id))
    const edges = model.value.edges.filter((e) => set.has(e.source) && set.has(e.target))
    const { svg, width, height } = buildErdSvg(visible.value, edges, positions.value, tokenColors(), notes.value)
    if (!svg) return
    const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await rasterise(svg, width, height, 2)
    saveBlob(blob, `${props.schema}-erd.${format}`)
  } catch {
    toast.push({ kind: 'error', title: t('erd.exportFailed') })
  } finally {
    exporting.value = false
  }
}

const stats = computed(() => ({ tables: visible.value.length, relations: buildEdgesCount() }))
function buildEdgesCount(): number {
  const set = new Set(visible.value.map((tb) => tb.id))
  return model.value.edges.filter((e) => set.has(e.source) && set.has(e.target)).length
}
const minimapColor = () => 'var(--border-strong)'
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="erd-chrome flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
      <div class="relative w-56">
        <UiInput
          v-model="search"
          :placeholder="t('erd.search')"
          :aria-label="t('erd.search')"
          @focus="searchOpen = true"
          @blur="closeSearchSoon"
          @keydown.enter="matches[0] && goTo(matches[0])"
        />
        <ul
          v-if="searchOpen && matches.length"
          class="font-data absolute z-20 mt-1 w-full rounded-md border border-border bg-surface p-1 text-xs shadow-pop"
        >
          <li v-for="m in matches" :key="m">
            <button type="button" class="w-full truncate rounded-sm px-2 py-1 text-left hover:bg-surface-hover" @mousedown.prevent="goTo(m)">{{ m }}</button>
          </li>
        </ul>
      </div>

      <template v-if="focus">
        <UiBadge tone="accent">{{ t('erd.focusing', { table: focus }) }}</UiBadge>
        <UiSelect :model-value="String(hops)" :options="hopOptions" @update:model-value="(v) => v && emit('update:hops', Number(v))" />
        <UiButton size="sm" @click="emit('update:focus', null)"><Icon name="lucide:x" class="size-3.5" />{{ t('erd.showAll') }}</UiButton>
      </template>
      <UiButton v-else-if="ui.selected" size="sm" @click="emit('update:focus', ui.selected)">
        <Icon name="lucide:focus" class="size-3.5" />{{ t('erd.showNeighbourhood', { table: ui.selected }) }}
      </UiButton>

      <span class="font-data ml-auto text-xs text-fg-subtle">{{ t('erd.stats', stats) }}</span>
      <HelpHint id="erd.layout" />
      <UiButton size="sm" data-erd-add-note @click="addNote"><Icon name="lucide:sticky-note" class="size-3.5" />{{ t('erd.addNote') }}</UiButton>
      <UiButton size="sm" @click="resetLayout"><Icon name="lucide:rotate-ccw" class="size-3.5" />{{ t('erd.resetLayout') }}</UiButton>
      <UiButton size="sm" :disabled="exporting" @click="exportImage('png')"><Icon name="lucide:image" class="size-3.5" />PNG</UiButton>
      <UiButton size="sm" :disabled="exporting" @click="exportImage('svg')"><Icon name="lucide:file-code" class="size-3.5" />SVG</UiButton>
    </div>

    <div class="relative min-h-0 flex-1">
      <VueFlow
        :min-zoom="0.05"
        :max-zoom="2"
        :connection-mode="ConnectionMode.Loose"
        :nodes-connectable="true"
        :only-render-visible-elements="true"
        :zoom-on-double-click="false"
        :delete-key-code="null"
        @node-click="onNodeClick"
        @node-double-click="openNode"
        @pane-click="select(null)"
        @node-drag-stop="onNodeDragStop"
        @connect-start="ui.connecting = true"
        @connect-end="ui.connecting = false"
        @connect="onConnect"
      >
        <template #node-table="nodeProps"><ErdTableNode v-bind="nodeProps" /></template>
        <template #node-note="nodeProps"><ErdNoteNode v-bind="nodeProps" /></template>
        <template #edge-erd="edgeProps"><ErdEdge v-bind="edgeProps" /></template>
        <Background :gap="24" pattern-color="var(--border)" />
        <MiniMap class="erd-chrome" pannable zoomable :node-color="minimapColor" mask-color="rgb(0 0 0 / 0.25)" />
      </VueFlow>

      <div class="erd-chrome absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-sm">
        <UiIconButton icon="lucide:plus" :label="t('erd.zoomIn')" size="sm" @click="flow.zoomIn({ duration: 150 })" />
        <UiIconButton icon="lucide:minus" :label="t('erd.zoomOut')" size="sm" @click="flow.zoomOut({ duration: 150 })" />
        <UiIconButton icon="lucide:maximize" :label="t('erd.fit')" size="sm" @click="flow.fitView({ padding: 0.1, duration: 250 })" />
      </div>

      <div v-if="layouting" class="erd-chrome absolute inset-0 z-10 flex items-center justify-center bg-bg/60">
        <UiSpinner />
      </div>
    </div>

    <UiDialog v-model:open="linkOpen" :title="t('erd.newRelation')" :description="t('erd.newRelationHint')">
      <div v-if="pendingLink" class="space-y-3">
        <p class="font-data text-sm">
          {{ pendingLink.fromTable }}.{{ pendingLink.fromColumn }} → {{ pendingLink.toTable }}.{{ pendingLink.toColumn }}
        </p>
        <label class="block text-xs text-fg-muted">
          {{ t('virtualRelations.cardinality') }}
          <UiSelect v-model="linkCardinalityModel" class="mt-1" :options="cardinalityOptions" />
        </label>
        <label class="block text-xs text-fg-muted">
          {{ t('erd.relationName') }}
          <UiInput v-model="linkName" class="mt-1" />
        </label>
      </div>
      <template #footer>
        <UiButton @click="linkOpen = false">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="primary" :loading="linkSaving" @click="saveLink">{{ t('virtualRelations.save') }}</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style>
.vue-flow__node-table {
  cursor: grab;
}
.vue-flow__connection-path {
  stroke: var(--accent);
  stroke-dasharray: 6 4;
}
.vue-flow__minimap {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
