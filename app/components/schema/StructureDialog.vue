<script setup lang="ts">
import type { RelationRef, SchemaTable } from '#shared/types/db'
import type { DbTrigger } from '#shared/types/routines'
import { alterTableSql, canRebuild, draftFromTable, dropTableSql, scriptOf, validateDraft, type DraftError, type TableDraft } from '#shared/ddl'
import { tablePath } from '#shared/nav-url'
import { useDdlRunner } from '~/composables/useDdlRunner'
import { useToast } from '~/composables/useToast'
import { useSchemaStore } from '~/stores/schema'
import RunConfirmDialog from '~/components/query/RunConfirmDialog.vue'
import StructureEditor from './StructureEditor.vue'
import TableStructure from './TableStructure.vue'

/**
 * The "Structure" dialog of a table: columns, relations and triggers, and, on an editable table,
 * an edit mode that turns the changes into DDL. The script is shown by the run confirmation and
 * goes through the raw SQL endpoint (read-only, prod and history guards included).
 */
const props = defineProps<{
  connectionId: string
  schema: string
  table: SchemaTable
  outgoing: RelationRef[]
  incoming: RelationRef[]
  triggers: DbTrigger[]
  /** The connection allows writes (not read-only) and the object is a table. */
  editable: boolean
  prod: boolean
  /** Typed to confirm destructive changes (drop table, drop column, ...). */
  connectionName?: string | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ openTrigger: [trigger: DbTrigger] }>()
const { t } = useI18n()
const toast = useToast()
const schemaStore = useSchemaStore()
const runner = useDdlRunner(() => props.connectionId, () => props.schema)

const dialect = computed(() => schemaStore.snapshot?.dialect ?? 'postgres')
const editing = ref(false)
const draft = ref<TableDraft>(draftFromTable(props.table))
const dropping = ref(false)

function startEditing(): void {
  draft.value = draftFromTable(props.table)
  runner.failure.value = null
  editing.value = true
}
watch(open, (isOpen) => {
  if (!isOpen) editing.value = false
})

const ddl = computed(() =>
  alterTableSql(
    dialect.value,
    props.schema,
    props.table,
    draft.value,
    props.triggers.map((tr) => tr.definition),
  ),
)
const errors = computed<DraftError[]>(() => {
  const list = validateDraft(draft.value)
  if (dialect.value === 'sqlite' && ddl.value.rebuild && !canRebuild(props.table)) list.push({ code: 'sqliteComputed' })
  return list
})
const script = computed(() => (errors.value.length ? '' : scriptOf(dialect.value, ddl.value)))

function review(): void {
  if (!script.value) return
  dropping.value = false
  runner.request(script.value)
}

function requestDrop(): void {
  dropping.value = true
  runner.request(dropTableSql(dialect.value, props.schema, props.table.name))
}

async function confirm(sql: string): Promise<void> {
  const name = draft.value.name.trim()
  const ok = await runner.confirm(sql)
  if (!ok) return
  editing.value = false
  if (dropping.value) {
    toast.push({ kind: 'success', title: t('structure.dropped', { table: props.table.name }) })
    open.value = false
    await navigateTo(`/c/${props.connectionId}/${encodeURIComponent(props.schema)}`)
    return
  }
  toast.push({ kind: 'success', title: t('structure.saved') })
  if (name !== props.table.name) await navigateTo(tablePath(props.connectionId, props.schema, name))
}
</script>

<template>
  <UiDialog
    v-model:open="open"
    wide
    :title="t(editing ? 'structure.editTitle' : 'tableView.structureTitle', { table: table.name })"
  >
    <template v-if="editing">
      <StructureEditor v-model="draft" :dialect="dialect" :is-new="false" :tables="schemaStore.tables" :errors="errors" />
      <p v-if="ddl.rebuild && !errors.length" class="mt-3 flex items-start gap-1.5 text-xs text-fg-muted" data-structure-rebuild>
        <Icon name="lucide:info" class="mt-0.5 size-3.5 shrink-0" />{{ t('structure.rebuild') }}
      </p>
      <pre v-if="runner.failure.value" class="font-data mt-3 whitespace-pre-wrap rounded-md border border-danger/40 bg-danger-soft p-2 text-xs text-danger" data-structure-failure>{{ runner.failure.value }}</pre>
    </template>
    <TableStructure v-else :table="table" :outgoing="outgoing" :incoming="incoming" :triggers="triggers" @open-trigger="(tr) => emit('openTrigger', tr)" />

    <template v-if="editable" #footer>
      <template v-if="editing">
        <UiButton variant="danger" class="mr-auto" :disabled="runner.running.value" data-drop-table @click="requestDrop">
          <Icon name="lucide:trash-2" class="size-3.5" />{{ t('structure.dropTable') }}
        </UiButton>
        <HelpHint id="structure.edit" />
        <UiButton @click="editing = false">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="primary" :disabled="!script" :loading="runner.running.value" data-review-structure @click="review">
          {{ t('structure.review') }}
        </UiButton>
      </template>
      <UiButton v-else data-edit-structure @click="startEditing">
        <Icon name="lucide:pencil" class="size-3.5" />{{ t('structure.edit') }}
      </UiButton>
    </template>
  </UiDialog>

  <RunConfirmDialog :sql="runner.pendingSql.value" :dialect="dialect" :prod="prod" :connection-name="connectionName" @cancel="runner.cancel" @confirm="confirm" />
</template>
