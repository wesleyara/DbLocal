<script setup lang="ts">
import type { FilterCondition, FilterNode } from '#shared/types/rows'
import { operatorArity } from '#shared/types/rows'
import type { SchemaColumn } from '#shared/types/db'
import FilterEditor from './FilterEditor.vue'
import FilterTree from './FilterTree.vue'

const props = defineProps<{ columns: SchemaColumn[]; filter: FilterNode | null }>()
const emit = defineEmits<{ change: [filter: FilterNode | null] }>()
const { t } = useI18n()
const { number } = useFormat()

/**
 * The top-level AND group is the list of chips. A root with another logic (OR) is one chip, so the
 * chips never silently change its meaning. Groups open the tree editor, which edits the whole root.
 */
const nodes = computed<FilterNode[]>(() => {
  const root = props.filter
  if (!root) return []
  return root.type === 'group' && root.logic === 'and' ? root.children : [root]
})

const openIndex = ref<number | null>(null)
const addOpen = ref(false)
const treeOpen = ref(false)
/** Draft of the tree editor: applied only on "Apply", so half-built groups never query the server. */
const draft = ref<FilterNode>({ type: 'group', logic: 'and', children: [] })

function commit(next: FilterNode[]): void {
  emit('change', next.length ? { type: 'group', logic: 'and', children: next } : null)
}

function replaceAt(index: number, condition: FilterCondition): void {
  openIndex.value = null
  commit(nodes.value.map((n, i) => (i === index ? condition : n)))
}

function removeAt(index: number): void {
  commit(nodes.value.filter((_, i) => i !== index))
}

function add(condition: FilterCondition): void {
  addOpen.value = false
  commit([...nodes.value, condition])
}

function openTree(): void {
  draft.value = props.filter ?? { type: 'group', logic: 'and', children: [] }
  treeOpen.value = true
}

function applyTree(): void {
  const root = draft.value
  const empty = root.type === 'group' && root.children.length === 0
  emit('change', empty ? null : root)
  treeOpen.value = false
}

function valueLabel(c: FilterCondition): string {
  const arity = operatorArity(c.op)
  if (arity === 'none') return ''
  const v = c.value
  if (Array.isArray(v)) return arity === 'pair' ? v.map(formatValue).join(' – ') : v.map(formatValue).join(', ')
  return v === undefined ? '' : formatValue(v)
}

function formatValue(v: unknown): string {
  return typeof v === 'number' ? number(v) : String(v)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <template v-for="(node, index) in nodes" :key="index">
      <UiPopover
        v-if="node.type === 'condition'"
        :open="openIndex === index"
        @update:open="(open: boolean) => (openIndex = open ? index : null)"
      >
        <template #trigger>
          <button
            type="button"
            class="font-data inline-flex h-6 max-w-72 items-center gap-1 rounded-md border border-accent/40 bg-accent-soft px-2 text-xs text-fg hover:bg-accent/20"
            :title="t('grid.editFilter')"
          >
            <span class="truncate">{{ node.column }}</span>
            <span class="text-fg-muted">{{ t(`grid.operators.${node.op}`) }}</span>
            <span v-if="valueLabel(node)" class="truncate text-fg">{{ valueLabel(node) }}</span>
          </button>
        </template>
        <FilterEditor :columns="columns" :value="node" @apply="(c) => replaceAt(index, c)" @cancel="openIndex = null" />
      </UiPopover>

      <button
        v-else
        type="button"
        class="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs text-fg-muted hover:text-fg"
        :title="t('grid.editGroups')"
        @click="openTree"
      >
        <Icon name="lucide:brackets" class="size-3" />
        {{ t('grid.advancedGroup', { count: node.type === 'group' ? node.children.length : 0 }) }}
      </button>

      <button
        type="button"
        class="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface hover:text-fg"
        :aria-label="t('grid.removeFilter')"
        @click="removeAt(index)"
      >
        <Icon name="lucide:x" class="size-3" />
      </button>
    </template>

    <UiPopover v-model:open="addOpen">
      <template #trigger>
        <button
          type="button"
          class="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
        >
          <Icon name="lucide:plus" class="size-3" />
          {{ t('grid.addFilter') }}
        </button>
      </template>
      <FilterEditor :columns="columns" @apply="add" @cancel="addOpen = false" />
    </UiPopover>

    <button
      type="button"
      class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface hover:text-fg"
      @click="openTree"
    >
      <Icon name="lucide:list-tree" class="size-3" />
      {{ t('grid.advancedFilters') }}
    </button>

    <button v-if="nodes.length" type="button" class="text-xs text-fg-subtle hover:text-fg" @click="commit([])">
      {{ t('grid.clearFilters') }}
    </button>

    <UiDialog v-model:open="treeOpen" :title="t('grid.advancedFilters')" :description="t('grid.advancedFiltersHint')">
      <FilterTree :node="draft" :columns="columns" @update="(next: FilterNode) => (draft = next)" />
      <template #footer>
        <UiButton size="sm" variant="ghost" @click="treeOpen = false">{{ t('common.cancel') }}</UiButton>
        <UiButton size="sm" variant="primary" @click="applyTree">{{ t('grid.applyFilter') }}</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
