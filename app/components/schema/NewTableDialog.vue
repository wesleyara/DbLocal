<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import { createTableSql, newTableDraft, scriptOf, validateDraft, type TableDraft } from '#shared/ddl'
import { tablePath } from '#shared/nav-url'
import { useDdlRunner } from '~/composables/useDdlRunner'
import { useToast } from '~/composables/useToast'
import { useSchemaStore } from '~/stores/schema'
import RunConfirmDialog from '~/components/query/RunConfirmDialog.vue'
import StructureEditor from './StructureEditor.vue'

/**
 * "New table": the structure editor on an empty draft (an identity `id` to start with). The
 * CREATE TABLE goes through the run confirmation and the raw SQL endpoint, then the new table opens.
 */
const props = defineProps<{ connectionId: string; schema: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const toast = useToast()
const schemaStore = useSchemaStore()
const runner = useDdlRunner(() => props.connectionId, () => props.schema)

const dialect = computed(() => schemaStore.snapshot?.dialect ?? 'postgres')
const draft = ref<TableDraft>(newTableDraft(dialect.value))
const connection = ref<ConnectionView | null>(null)
const readonly = computed(() => !!connection.value && (connection.value.readonly || connection.value.readonlyGlobal))

watch(open, async (isOpen) => {
  if (!isOpen) return
  draft.value = newTableDraft(dialect.value)
  runner.failure.value = null
  connection.value = await $fetch<ConnectionView>(`/api/connections/${props.connectionId}`).catch(() => null)
})

const errors = computed(() => {
  const list = validateDraft(draft.value)
  const name = draft.value.name.trim().toLowerCase()
  if (name && schemaStore.tables.some((tb) => tb.name.toLowerCase() === name)) list.push({ code: 'tableExists', name: draft.value.name.trim() })
  return list
})
const script = computed(() =>
  errors.value.length ? '' : scriptOf(dialect.value, { statements: createTableSql(dialect.value, props.schema, draft.value), rebuild: false }),
)

async function confirm(sql: string): Promise<void> {
  const name = draft.value.name.trim()
  if (!(await runner.confirm(sql))) return
  toast.push({ kind: 'success', title: t('structure.created', { table: name }) })
  open.value = false
  await navigateTo(tablePath(props.connectionId, props.schema, name))
}
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('structure.newTitle')" :description="t('structure.newDescription', { schema })">
    <p v-if="readonly" class="text-sm text-warning">{{ t('edit.connectionReadonly') }}</p>
    <template v-else>
      <StructureEditor v-model="draft" :dialect="dialect" is-new :tables="schemaStore.tables" :errors="draft.name.trim() ? errors : []" />
      <pre v-if="runner.failure.value" class="font-data mt-3 whitespace-pre-wrap rounded-md border border-danger/40 bg-danger-soft p-2 text-xs text-danger" data-structure-failure>{{ runner.failure.value }}</pre>
    </template>
    <template #footer>
      <HelpHint id="structure.edit" />
      <UiButton @click="open = false">{{ t('common.cancel') }}</UiButton>
      <UiButton variant="primary" :disabled="readonly || !script" :loading="runner.running.value" data-create-table @click="runner.request(script)">
        {{ t('structure.create') }}
      </UiButton>
    </template>
  </UiDialog>

  <RunConfirmDialog
    :sql="runner.pendingSql.value"
    :dialect="dialect"
    :prod="connection?.environment === 'prod'"
    @cancel="runner.cancel"
    @confirm="confirm"
  />
</template>
