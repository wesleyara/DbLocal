<script setup lang="ts">
import { getSmoothStepPath, Position, type EdgeProps } from '@vue-flow/core'
import { cardinalityShort, labelChipWidth, LABEL_CHIP_HEIGHT, markerPath, type EndCardinality } from '#shared/erd'
import { ERD_UI } from './state'

interface EdgeData {
  sourceEnd: EndCardinality
  targetEnd: EndCardinality
  virtual: boolean
  name: string
  hover: (id: string | null) => void
}

const props = defineProps<EdgeProps<EdgeData>>()
const ui = inject(ERD_UI)!
const { t } = useI18n()

/** Cardinality read from the two line ends (source = FK side). */
const cardinalityLabel = computed(() => {
  const d = props.data
  if (!d) return ''
  const key = d.sourceEnd === 'one' ? (d.targetEnd === 'one' ? 'oneToOne' : 'oneToMany') : d.targetEnd === 'one' ? 'manyToOne' : 'manyToMany'
  return t(`virtualRelations.cardinalityOptions.${key}`)
})

const geometry = computed(() => {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 10,
    offset: 22,
  })
  return { path, labelX, labelY }
})

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

/** Chip around the label, sized for the 11px monospace text, after the canvas's spreading. */
const labelPos = computed(() => ({ x: geometry.value.labelX, y: geometry.value.labelY + (ui.labelOffsets.get(props.id) ?? 0) }))
const labelBox = computed(() => {
  const width = labelChipWidth(shortLabel.value)
  return { x: labelPos.value.x - width / 2, y: labelPos.value.y - LABEL_CHIP_HEIGHT / 2, width, height: LABEL_CHIP_HEIGHT }
})

const sourceDir = computed<1 | -1>(() => (props.sourcePosition === Position.Right ? 1 : -1))
const targetDir = computed<1 | -1>(() => (props.targetPosition === Position.Right ? 1 : -1))
const markers = computed(() => {
  if (!props.data || ui.compact) return ''
  return (
    markerPath(props.sourceX, props.sourceY, sourceDir.value, props.data.sourceEnd) +
    markerPath(props.targetX, props.targetY, targetDir.value, props.data.targetEnd)
  )
})

const active = computed(() => ui.hoverEdge === props.id)
const dimmed = computed(
  () => !active.value && ui.selected !== null && !(props.source === ui.selected || props.target === ui.selected),
)
</script>

<template>
  <g
    class="erd-edge"
    :class="[data?.virtual && 'is-virtual', active && 'is-active', dimmed && 'is-dimmed']"
    @mouseenter="data?.hover(id)"
    @mouseleave="data?.hover(null)"
  >
    <path :d="geometry.path" fill="none" stroke="transparent" stroke-width="14" />
    <path :d="geometry.path" class="line" fill="none" />
    <path v-if="markers" :d="markers" class="line" fill="none" />
    <g v-if="shortLabel && !ui.compact" class="label" data-erd-cardinality>
      <rect v-bind="labelBox" rx="4" />
      <text :x="labelPos.x" :y="labelPos.y" text-anchor="middle" dominant-baseline="central">{{ shortLabel }}</text>
    </g>
    <title>{{ data?.name }}{{ data?.virtual ? ' (virtual)' : '' }} · {{ cardinalityLabel }}</title>
  </g>
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
.label rect {
  fill: var(--bg);
  stroke: var(--border);
}
.label text {
  fill: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.is-virtual .label text,
.is-active .label text {
  fill: var(--accent);
}
.is-active .label rect {
  stroke: var(--accent);
}
.is-dimmed {
  opacity: 0.15;
}
.erd-edge {
  cursor: pointer;
}
</style>
