<script setup lang="ts">
import { operatorArity, type FilterNode, type FilterOperator } from '#shared/types/rows'
import type { SchemaColumn } from '#shared/types/db'
import { buildCondition, inputTypeOf, inputsOf, operatorsOf } from './filter-values'

/** Deepest group the editor offers; the server accepts up to 4 levels. */
const MAX_DEPTH = 2

const props = defineProps<{ node: FilterNode; columns: SchemaColumn[]; depth?: number }>()
const emit = defineEmits<{ update: [node: FilterNode]; remove: [] }>()
const { t } = useI18n()

const depth = computed(() => props.depth ?? 0)
const columnOptions = computed(() => props.columns.map((c) => ({ value: c.name, label: c.name })))

function replaceChild(index: number, child: FilterNode): void {
  if (props.node.type !== 'group') return
  emit('update', { ...props.node, children: props.node.children.map((c, i) => (i === index ? child : c)) })
}

function removeChild(index: number): void {
  if (props.node.type !== 'group') return
  emit('update', { ...props.node, children: props.node.children.filter((_, i) => i !== index) })
}

function addChild(child: FilterNode): void {
  if (props.node.type !== 'group') return
  emit('update', { ...props.node, children: [...props.node.children, child] })
}

const firstColumn = () => props.columns[0]
const newCondition = () => ({ type: 'condition' as const, column: firstColumn()?.name ?? '', op: 'eq' as const })

// ---- condition fields (one condition, edited in place) ----------------------------------------

const condition = computed(() => (props.node.type === 'condition' ? props.node : null))
const columnOf = (name: string) => props.columns.find((c) => c.name === name)

function setColumn(name: string | undefined): void {
  const c = condition.value
  if (!c || !name) return
  const column = columnOf(name)
  const ops = operatorsOf(column)
  const op = ops.includes(c.op) ? c.op : (ops[0] ?? 'eq')
  // A new column keeps no value: the old one might not fit its type.
  emit('update', { type: 'condition', column: name, op: op as FilterOperator })
}

function setOp(op: string | undefined): void {
  const c = condition.value
  if (!c || !op) return
  emit('update', { type: 'condition', column: c.column, op: op as FilterOperator })
}

/** Text inputs, kept here so a half-typed value does not reach the tree until it is complete. */
const first = ref('')
const second = ref('')
watch(
  condition,
  (c) => {
    const parts = inputsOf(c?.value)
    first.value = parts.first
    second.value = parts.second
  },
  { immediate: true },
)

function commitValue(): void {
  const c = condition.value
  const column = c ? columnOf(c.column) : undefined
  if (!c || !column) return
  const built = buildCondition(column, c.op, first.value, second.value)
  if (built) emit('update', built)
}

const selectedColumn = computed(() => (condition.value ? columnOf(condition.value.column) : undefined))
const opOptions = computed(() =>
  operatorsOf(selectedColumn.value).map((o) => ({ value: o, label: t(`grid.operators.${o}`) })),
)
const arity = computed(() => (condition.value ? operatorArity(condition.value.op) : 'none'))
const logicOptions = computed(() => [
  { value: 'and', label: t('grid.logicAnd') },
  { value: 'or', label: t('grid.logicOr') },
])

function setLogic(logic: string | undefined): void {
  if (props.node.type !== 'group' || !logic) return
  emit('update', { ...props.node, logic: logic as 'and' | 'or' })
}
</script>

<template>
  <!-- Group: its logic, its children, and buttons to add more. -->
  <div v-if="node.type === 'group'" class="grid gap-2 rounded-md border border-border p-2" :class="depth > 0 && 'bg-bg-subtle'">
    <div class="flex flex-wrap items-center gap-2">
      <UiSelect :model-value="node.logic" :options="logicOptions" class="w-28" @update:model-value="setLogic" />
      <span class="text-xs text-fg-subtle">{{ t('grid.groupHint') }}</span>
      <div class="ml-auto flex items-center gap-1">
        <UiButton size="sm" variant="ghost" @click="addChild(newCondition())">
          <Icon name="lucide:plus" class="size-3" />{{ t('grid.addCondition') }}
        </UiButton>
        <UiButton v-if="depth < MAX_DEPTH" size="sm" variant="ghost" @click="addChild({ type: 'group', logic: 'and', children: [newCondition()] })">
          <Icon name="lucide:brackets" class="size-3" />{{ t('grid.addGroup') }}
        </UiButton>
        <UiIconButton v-if="depth > 0" icon="lucide:trash-2" :label="t('grid.removeGroup')" size="sm" @click="emit('remove')" />
      </div>
    </div>
    <p v-if="node.children.length === 0" class="text-xs text-fg-subtle">{{ t('grid.emptyGroup') }}</p>
    <FilterTree
      v-for="(child, index) in node.children"
      :key="index"
      :node="child"
      :columns="columns"
      :depth="depth + 1"
      @update="(next: FilterNode) => replaceChild(index, next)"
      @remove="removeChild(index)"
    />
  </div>

  <!-- Condition: column, operator and value, in one row. -->
  <div v-else class="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5">
    <UiSelect :model-value="node.column" :options="columnOptions" class="w-44" @update:model-value="setColumn" />
    <UiSelect :model-value="node.op" :options="opOptions" class="w-40" @update:model-value="setOp" />
    <template v-if="arity === 'scalar' && selectedColumn?.kind === 'enum' && selectedColumn.enumValues?.length">
      <UiSelect
        :model-value="first"
        :options="selectedColumn.enumValues.map((v) => ({ value: v, label: v }))"
        :placeholder="t('grid.selectValue')"
        class="w-48"
        @update:model-value="(v) => { first = v ?? ''; commitValue() }"
      />
    </template>
    <template v-else-if="arity === 'scalar' || arity === 'list'">
      <UiInput v-model="first" mono class="w-48" :type="inputTypeOf(selectedColumn?.kind)" :placeholder="arity === 'list' ? t('grid.filterListHint') : undefined" @change="commitValue" />
    </template>
    <template v-else-if="arity === 'pair'">
      <UiInput v-model="first" mono class="w-36" :type="inputTypeOf(selectedColumn?.kind)" @change="commitValue" />
      <UiInput v-model="second" mono class="w-36" :type="inputTypeOf(selectedColumn?.kind)" @change="commitValue" />
    </template>
    <UiIconButton icon="lucide:trash-2" :label="t('grid.removeFilter')" size="sm" class="ml-auto" @click="emit('remove')" />
  </div>
</template>
