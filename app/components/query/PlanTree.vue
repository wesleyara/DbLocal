<script setup lang="ts">
import type { PlanNode } from '#shared/types/explain'

const props = withDefaults(defineProps<{ node: PlanNode; total?: number | null; depth?: number }>(), { total: null, depth: 0 })
const { number } = useFormat()
const { t } = useI18n()

const weight = computed(() => props.node.timeMs ?? props.node.cost)
/** Share of the whole plan's weight (time when analyzed, otherwise cost). */
const share = computed(() => (props.total && weight.value !== null ? Math.min(1, weight.value / props.total) : 0))
const hot = computed(() => share.value >= 0.5 && props.depth > 0)
const fmt = (n: number | null, digits = 2): string => (n === null ? '–' : number(n, { maximumFractionDigits: digits }))
</script>

<template>
  <div>
    <div
      class="flex items-baseline gap-3 rounded-sm px-2 py-1 text-xs"
      :class="hot ? 'bg-danger-soft' : 'hover:bg-surface'"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      data-plan-node
      :data-hot="hot || undefined"
    >
      <span class="font-data font-medium text-fg">{{ node.label }}</span>
      <span v-if="node.detail" class="font-data truncate text-fg-muted">{{ node.detail }}</span>
      <span class="font-data ml-auto flex shrink-0 gap-3 text-fg-subtle">
        <span v-if="node.cost !== null" :title="t('query.explain.cost')">{{ t('query.explain.cost') }} {{ fmt(node.cost) }}</span>
        <span v-if="node.rows !== null" :title="t('query.explain.rows')">{{ t('query.explain.rows') }} {{ fmt(node.rows, 0) }}</span>
        <span v-if="node.timeMs !== null" :class="hot ? 'text-danger' : ''" :title="t('query.explain.time')">{{ fmt(node.timeMs) }} ms</span>
      </span>
    </div>
    <PlanTree v-for="(child, i) in node.children" :key="i" :node="child" :total="total" :depth="depth + 1" />
  </div>
</template>
