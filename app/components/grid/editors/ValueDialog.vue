<script setup lang="ts">
import type { SchemaColumn } from '#shared/types/db'
import { parseInput, toInputText } from '#shared/edit-values'

/**
 * Editor for values that do not fit a cell: JSON, arrays and long text. The text is validated as
 * it is typed (a JSON error shows before the user tries to apply).
 */
const props = defineProps<{ column: SchemaColumn | null; value: unknown }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ commit: [value: unknown] }>()
const { t } = useI18n()

const text = ref('')
watch(
  () => [open.value, props.column?.name, props.value] as const,
  () => {
    if (open.value && props.column) text.value = toInputText(props.column, props.value)
  },
  { immediate: true },
)

const parsed = computed(() => (props.column ? parseInput(props.column, text.value) : null))
const error = computed(() => (parsed.value && !parsed.value.ok ? t(`edit.errors.${parsed.value.error}`) : null))
const needsValue = computed(() => parsed.value?.ok && parsed.value.value === null && props.column && !props.column.nullable)

function apply(): void {
  if (!parsed.value?.ok || needsValue.value) return
  emit('commit', parsed.value.value)
  open.value = false
}
</script>

<template>
  <UiDialog v-model:open="open" :title="column?.name ?? ''" :description="column?.nativeType">
    <textarea
      v-model="text"
      spellcheck="false"
      rows="12"
      :aria-label="column?.name"
      :aria-invalid="error ? 'true' : undefined"
      class="font-data w-full resize-y rounded-md border bg-bg-subtle p-2 text-xs text-fg outline-none focus:border-accent"
      :class="error ? 'border-danger' : 'border-border'"
      data-value-editor
    />
    <p v-if="error" class="mt-1 text-xs text-danger" role="alert">{{ error }}</p>
    <p v-else-if="needsValue" class="mt-1 text-xs text-danger" role="alert">{{ t('edit.errors.required') }}</p>
    <template #footer>
      <UiButton size="sm" variant="secondary" @click="open = false">{{ t('common.cancel') }}</UiButton>
      <UiButton size="sm" :disabled="!!error || !!needsValue" data-value-apply @click="apply">{{ t('edit.apply') }}</UiButton>
    </template>
  </UiDialog>
</template>
