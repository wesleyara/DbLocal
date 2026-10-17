<script setup lang="ts">
import { getSmoothStepPath, Position, type EdgeProps } from '@vue-flow/core'
import { cardinalityShort, markerPath, type EndCardinality } from '#shared/erd'
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
/** Chip around the label, sized for the 11px monospace text. */
const labelBox = computed(() => {
  const width = shortLabel.value.length * 6.8 + 10
  return { x: geometry.value.labelX - width / 2, y: geometry.value.labelY - 9, width, height: 18 }
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
      <text :x="geometry.labelX" :y="geometry.labelY" text-anchor="middle" dominant-baseline="central">{{ shortLabel }}</text>
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
