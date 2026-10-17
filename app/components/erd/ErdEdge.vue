<script setup lang="ts">
import { EdgeLabelRenderer, Position, useVueFlow, type EdgeProps } from '@vue-flow/core'
import { cardinalityShort, labelChipWidth, LABEL_CHIP_HEIGHT, markerPath, parseHandle, wirePath, type EndCardinality } from '#shared/erd'
import { ERD_UI } from './state'

interface EdgeData {
  sourceEnd: EndCardinality
  targetEnd: EndCardinality
  virtual: boolean
  name: string
  hover: (id: string | null) => void
  /** Saves the leg's shift (`null`: back to the automatic spot). */
  moveWire: (id: string, dx: number | null) => void
}

const props = defineProps<EdgeProps<EdgeData>>()
const ui = inject(ERD_UI)!
const { t } = useI18n()
const { viewport } = useVueFlow()

/** Cardinality read from the two line ends (source = FK side). */
const cardinalityLabel = computed(() => {
  const d = props.data
  if (!d) return ''
  const key = d.sourceEnd === 'one' ? (d.targetEnd === 'one' ? 'oneToOne' : 'oneToMany') : d.targetEnd === 'one' ? 'manyToOne' : 'manyToMany'
  return t(`virtualRelations.cardinalityOptions.${key}`)
})

/**
 * Which way each end leaves its table. The handle id carries the side (`<column>:r`); Vue Flow's
 * `sourcePosition` can still be its top/bottom fallback right after a load, which flipped the line.
 */
const dirOf = (handle: string | null | undefined, position: Position): 1 | -1 => {
  const side = parseHandle(handle)?.side
  return (side ? side === 'r' : position === Position.Right) ? 1 : -1
}
const sourceDir = computed(() => dirOf(props.sourceHandleId, props.sourcePosition))
const targetDir = computed(() => dirOf(props.targetHandleId, props.targetPosition))

/** Same path builder as the export, so a moved line looks the same in the PNG/SVG. */
const geometry = computed(() =>
  wirePath(props.sourceX, props.sourceY, sourceDir.value, props.targetX, props.targetY, targetDir.value, ui.wires.get(props.id) ?? 0),
)
/** About 14 screen pixels wide at any zoom, so the leg stays easy to grab when zoomed out. */
const legGrab = computed(() => 14 / (viewport.value.zoom || 1))
/** The vertical leg alone: the wide, invisible grab area for dragging the line sideways. */
const legPath = computed(() => `M${geometry.value.x},${props.sourceY} L${geometry.value.x},${props.targetY}`)

const shortLabel = computed(() => (props.data ? cardinalityShort(props.data.sourceEnd, props.data.targetEnd) : ''))

// The chip's spot is reported to the canvas, which moves chips of edges sharing a channel apart.
watchEffect(() => {
  if (!shortLabel.value || ui.compact) return void ui.labelBoxes.delete(props.id)
  ui.labelBoxes.set(props.id, {
    id: props.id,
    x: geometry.value.labelX,
    y: geometry.value.labelY,
    width: labelChipWidth(shortLabel.value),
    height: LABEL_CHIP_HEIGHT,
    y1: props.sourceY,
    y2: props.targetY,
  })
})
onBeforeUnmount(() => ui.labelBoxes.delete(props.id))
const labelPos = computed(() => ({ x: geometry.value.labelX, y: geometry.value.labelY + (ui.labelOffsets.get(props.id) ?? 0) }))

const markers = computed(() => {
  if (!props.data || ui.compact) return ''
  return (
    markerPath(props.sourceX, props.sourceY, sourceDir.value, props.data.sourceEnd) +
    markerPath(props.targetX, props.targetY, targetDir.value, props.data.targetEnd)
  )
})

// ---- dragging the line sideways (leg or chip); double-click puts it back ----------------------
const dragging = ref(false)
let start = { clientX: 0, dx: 0 }
function onDragStart(event: PointerEvent): void {
  if (event.button !== 0) return
  event.stopPropagation()
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  dragging.value = true
  start = { clientX: event.clientX, dx: ui.wires.get(props.id) ?? 0 }
}
function onDragMove(event: PointerEvent): void {
  if (!dragging.value) return
  const dx = Math.round(start.dx + (event.clientX - start.clientX) / (viewport.value.zoom || 1))
  ui.wires.set(props.id, dx)
}
function onDragEnd(event: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  ;(event.currentTarget as Element).releasePointerCapture(event.pointerId)
  const dx = ui.wires.get(props.id) ?? 0
  if (dx !== start.dx) props.data?.moveWire(props.id, dx || null)
}
function resetWire(): void {
  if (!ui.wires.has(props.id)) return
  ui.wires.delete(props.id)
  props.data?.moveWire(props.id, null)
}

const active = computed(() => ui.hoverEdge === props.id || dragging.value)
const dimmed = computed(
  () => !active.value && ui.selected !== null && !(props.source === ui.selected || props.target === ui.selected),
)
const stateClass = computed(() => [props.data?.virtual && 'is-virtual', active.value && 'is-active', dimmed.value && 'is-dimmed'])
</script>

<template>
  <g class="erd-edge" :class="stateClass" @mouseenter="data?.hover(id)" @mouseleave="data?.hover(null)">
    <path :d="geometry.path" fill="none" stroke="transparent" stroke-width="14" />
    <path :d="geometry.path" class="line" fill="none" />
    <path v-if="markers" :d="markers" class="line" fill="none" />
    <path
      v-if="!ui.compact"
      :d="legPath"
      class="leg nodrag nopan"
      fill="none"
      stroke="transparent"
      :stroke-width="legGrab"
      data-erd-wire
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
      @pointercancel="onDragEnd"
      @dblclick.stop="resetWire"
    />
    <title>{{ data?.name }}{{ data?.virtual ? ' (virtual)' : '' }} · {{ cardinalityLabel }} · {{ t('erd.wireHint') }}</title>
  </g>
  <!-- Chips live in Vue Flow's label layer, above every line: a line drawn later never crosses one. -->
  <EdgeLabelRenderer v-if="shortLabel && !ui.compact">
    <div
      class="erd-chip nodrag nopan"
      :class="stateClass"
      :style="{ transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)` }"
      :title="`${data?.name ?? ''} · ${cardinalityLabel} · ${t('erd.wireHint')}`"
      data-erd-cardinality
      @mouseenter="data?.hover(id)"
      @mouseleave="data?.hover(null)"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
      @pointercancel="onDragEnd"
      @dblclick.stop="resetWire"
    >
      {{ shortLabel }}
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.line {
  stroke: var(--fg-subtle);
  stroke-width: 1.4;
}
.is-virtual .line {
  stroke: var(--accent);
  stroke-dasharray: 6 4;
}
.is-active .line {
  stroke: var(--fg);
  stroke-width: 2.2;
}
.is-virtual.is-active .line {
  stroke: var(--accent);
}
.is-dimmed {
  opacity: 0.15;
}
.erd-edge {
  cursor: pointer;
}
.leg {
  cursor: ew-resize;
  pointer-events: stroke;
}
/* Above the tables too: a line moved under a table keeps a chip that can still be grabbed or double-clicked. */
.erd-chip {
  position: absolute;
  z-index: 1001;
  height: 18px;
  padding: 0 5px;
  line-height: 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
  pointer-events: all;
  cursor: ew-resize;
  user-select: none;
}
.erd-chip.is-virtual,
.erd-chip.is-active {
  color: var(--accent);
}
.erd-chip.is-active {
  border-color: var(--accent);
}
</style>
