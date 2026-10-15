<script setup lang="ts">
import type { SchemaColumn } from '#shared/types/db'
import { parseInput, toInputText } from '#shared/edit-values'

/**
 * Inline editor of one cell, chosen by the column kind: text, number, date/time picker or enum
 * select. Booleans, JSON and arrays are not edited here (the grid toggles booleans and opens a
 * dialog for JSON). Enter commits and moves down, Tab commits and moves right, Esc cancels.
 */
const props = defineProps<{ column: SchemaColumn; value: unknown }>()
const emit = defineEmits<{
  commit: [value: unknown, move: 'down' | 'right' | 'none']
  cancel: []
}>()
const { t } = useI18n()

const text = ref(toInputText(props.column, props.value))
const error = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | HTMLSelectElement | null>(null)
/** Set once a commit or cancel was emitted, so the blur that follows does not commit twice. */
let done = false

const inputType = computed(() => {
  switch (props.column.kind) {
    case 'date':
      return 'date'
    case 'datetime':
      return 'datetime-local'
    case 'time':
      return 'time'
    default:
      return 'text'
  }
})

onMounted(() => {
  inputEl.value?.focus()
  if (inputEl.value instanceof HTMLInputElement && inputType.value === 'text') inputEl.value.select()
})

function commit(move: 'down' | 'right' | 'none'): void {
  if (done) return
  if (props.column.kind === 'enum') {
    done = true
    emit('commit', text.value === '' && props.column.nullable ? null : text.value, move)
    return
  }
  const parsed = parseInput(props.column, text.value)
  if (!parsed.ok) {
    error.value = t(`edit.errors.${parsed.error}`)
    return
  }
  if (parsed.value === null && !props.column.nullable) {
    error.value = t('edit.errors.required')
    return
  }
  done = true
  emit('commit', parsed.value, move)
}

function cancel(): void {
  if (done) return
  done = true
  emit('cancel')
}

function onKeydown(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key === 'Enter') {
    event.preventDefault()
    commit('down')
  } else if (event.key === 'Tab') {
    event.preventDefault()
    commit('right')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  }
}
</script>

<template>
  <div class="relative size-full" data-cell-editor @mousedown.stop @dblclick.stop @click.stop>
    <select
      v-if="column.kind === 'enum'"
      ref="inputEl"
      v-model="text"
      class="font-data h-full w-full rounded-sm border border-accent bg-bg px-1 text-xs text-fg outline-none"
      :aria-label="column.name"
      @keydown="onKeydown"
      @change="commit('none')"
      @blur="cancel"
    >
      <option v-if="column.nullable" value="">NULL</option>
      <option v-for="v in column.enumValues ?? []" :key="v" :value="v">{{ v }}</option>
    </select>
    <input
      v-else
      ref="inputEl"
      v-model="text"
      :type="inputType"
      :step="inputType === 'datetime-local' || inputType === 'time' ? 1 : undefined"
      :aria-label="column.name"
      :aria-invalid="error ? 'true' : undefined"
      :inputmode="column.kind === 'number' ? 'decimal' : undefined"
      spellcheck="false"
      class="font-data h-full w-full rounded-sm border bg-bg px-1 text-xs text-fg outline-none"
      :class="[error ? 'border-danger' : 'border-accent', column.kind === 'number' && 'text-right']"
      @keydown="onKeydown"
      @input="error = null"
      @blur="commit('none')"
    >
    <p
      v-if="error"
      class="absolute left-0 top-full z-40 mt-0.5 whitespace-nowrap rounded-sm border border-danger bg-surface px-1.5 py-0.5 text-[11px] text-danger shadow-pop"
      role="alert"
    >{{ error }}</p>
  </div>
</template>
