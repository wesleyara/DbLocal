<script setup lang="ts">
import { OPERATORS_BY_KIND, operatorArity, type FilterCondition, type FilterOperator } from '#shared/types/rows'
import type { SchemaColumn } from '#shared/types/db'
import { buildCondition, inputTypeOf, inputsOf } from './filter-values'

const props = defineProps<{ columns: SchemaColumn[]; value?: FilterCondition | null }>()
const emit = defineEmits<{ apply: [condition: FilterCondition]; cancel: [] }>()
const { t } = useI18n()

const column = ref(props.value?.column ?? props.columns[0]?.name ?? '')
const op = ref<FilterOperator>(props.value?.op ?? OPERATORS_BY_KIND[props.columns[0]?.kind ?? 'other'][0]!)
const initial = inputsOf(props.value?.value)
const first = ref(initial.first)
const second = ref(initial.second)

const selected = computed(() => props.columns.find((c) => c.name === column.value))
const operatorOptions = computed(() =>
  (selected.value ? OPERATORS_BY_KIND[selected.value.kind] : []).map((o) => ({ value: o, label: t(`grid.operators.${o}`) })),
)
const columnOptions = computed(() => props.columns.map((c) => ({ value: c.name, label: c.name })))
const arity = computed(() => operatorArity(op.value))

/** Enum columns offer their values instead of free text. */
const enumOptions = computed(() =>
  selected.value?.kind === 'enum' && selected.value.enumValues?.length
    ? selected.value.enumValues.map((v) => ({ value: v, label: v }))
    : null,
)

const inputType = computed(() => inputTypeOf(selected.value?.kind))

// Changing the column can leave the operator without meaning (e.g. `contains` on a number): pick the first valid one.
watch(column, () => {
  if (!selected.value) return
  if (!OPERATORS_BY_KIND[selected.value.kind].includes(op.value)) op.value = OPERATORS_BY_KIND[selected.value.kind][0]!
})

function build(): FilterCondition | null {
  const c = selected.value
  return c ? buildCondition(c, op.value, first.value, second.value) : null
}

const candidate = computed(() => build())

function submit(): void {
  if (candidate.value) emit('apply', candidate.value)
}
</script>

<template>
  <form class="grid w-72 gap-3" @submit.prevent="submit">
    <label class="grid gap-1 text-xs text-fg-muted">
      {{ t('grid.filterColumn') }}
      <UiSelect v-model="column" :options="columnOptions" />
    </label>
    <label class="grid gap-1 text-xs text-fg-muted">
      {{ t('grid.filterOperator') }}
      <UiSelect v-model="op" :options="operatorOptions" />
    </label>

    <label v-if="arity === 'scalar' && enumOptions" class="grid gap-1 text-xs text-fg-muted">
      {{ t('grid.filterValue') }}
      <UiSelect v-model="first" :options="enumOptions" :placeholder="t('grid.selectValue')" />
    </label>
    <label v-else-if="arity === 'scalar'" class="grid gap-1 text-xs text-fg-muted">
      {{ t('grid.filterValue') }}
      <UiInput v-model="first" :type="inputType" mono autofocus />
    </label>
    <label v-else-if="arity === 'list'" class="grid gap-1 text-xs text-fg-muted">
      {{ t('grid.filterValue') }}
      <UiInput v-model="first" mono :placeholder="t('grid.filterListHint')" autofocus />
    </label>
    <div v-else-if="arity === 'pair'" class="grid grid-cols-2 gap-2">
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ t('grid.filterValueFrom') }}
        <UiInput v-model="first" :type="inputType" mono autofocus />
      </label>
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ t('grid.filterValueTo') }}
        <UiInput v-model="second" :type="inputType" mono />
      </label>
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <UiButton size="sm" variant="ghost" @click="emit('cancel')">{{ t('common.cancel') }}</UiButton>
      <UiButton size="sm" variant="primary" type="submit" :disabled="!candidate">{{ t('grid.applyFilter') }}</UiButton>
    </div>
  </form>
</template>
