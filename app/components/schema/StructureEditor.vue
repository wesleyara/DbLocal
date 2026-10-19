<script setup lang="ts">
import type { ReferentialAction, SchemaTable } from '#shared/types/db'
import {
  foreignKeyName,
  indexName,
  REFERENTIAL_ACTIONS,
  TYPE_SUGGESTIONS,
  type ColumnDraft,
  type DdlDialect,
  type DraftError,
  type TableDraft,
} from '#shared/ddl'

/**
 * Form over a `TableDraft`: table name, columns (name, type, NULL, default), indexes and foreign
 * keys. It only edits the draft; the page builds the SQL from it and runs it. On an existing table
 * the primary key and identity are shown but not editable, and indexes and foreign keys can be
 * removed or added, not changed.
 */
const props = defineProps<{
  dialect: DdlDialect
  /** A new table: the primary key and identity can be set. */
  isNew: boolean
  /** Tables of the schema, for the foreign key targets. */
  tables: SchemaTable[]
  errors: DraftError[]
}>()
const draft = defineModel<TableDraft>({ required: true })
const { t } = useI18n()

const typeList = useId()
const types = computed(() => TYPE_SUGGESTIONS[props.dialect])

function addColumn(): void {
  draft.value.columns.push({
    from: null,
    name: '',
    type: props.dialect === 'sqlite' ? 'TEXT' : 'text',
    nullable: true,
    default: null,
    identity: false,
    computed: false,
    comment: null,
    onUpdate: null,
  })
  nextTick(() => document.querySelector<HTMLInputElement>('[data-column-row]:last-child [data-column-name]')?.focus())
}

/** Removing a column also removes the indexes and keys that use it. */
function removeColumn(column: ColumnDraft): void {
  const d = draft.value
  d.columns = d.columns.filter((c) => c !== column)
  d.primaryKey = d.primaryKey.filter((c) => c !== column.name)
  d.indexes = d.indexes.filter((i) => !i.columns.includes(column.name))
  d.foreignKeys = d.foreignKeys.filter((f) => !f.columns.includes(column.name))
}

function rename(column: ColumnDraft, name: string): void {
  const before = column.name
  column.name = name
  // New indexes, keys and the key of a new table follow the column; existing ones are renamed by the database.
  const follow = (cols: string[]) => cols.map((c) => (c === before ? name : c))
  draft.value.primaryKey = follow(draft.value.primaryKey)
  for (const i of draft.value.indexes) if (i.from === null) i.columns = follow(i.columns)
  for (const f of draft.value.foreignKeys) if (f.from === null) f.columns = follow(f.columns)
}

function togglePrimary(column: ColumnDraft, on: boolean): void {
  const pk = draft.value.primaryKey.filter((c) => c !== column.name)
  draft.value.primaryKey = on ? [...pk, column.name] : pk
  if (on) column.nullable = false
  else column.identity = false
}

function setDefault(column: ColumnDraft, text: string | number | undefined): void {
  const value = String(text ?? '')
  column.default = value.trim() === '' ? null : value
}

const columnNames = computed(() => draft.value.columns.map((c) => c.name.trim()).filter(Boolean))

// ---- new index ----
const indexColumns = ref<string[]>([])
const indexUnique = ref(false)
function toggleIndexColumn(name: string, on: boolean): void {
  indexColumns.value = on ? [...indexColumns.value, name] : indexColumns.value.filter((c) => c !== name)
}
function addIndex(): void {
  if (indexColumns.value.length === 0) return
  const name = indexName(draft.value.name.trim() || 'table', indexColumns.value, indexUnique.value)
  draft.value.indexes.push({ from: null, name, columns: [...indexColumns.value], unique: indexUnique.value })
  indexColumns.value = []
  indexUnique.value = false
}

// ---- new foreign key ----
const fkColumn = ref<string>()
const fkTable = ref<string>()
const fkRefColumn = ref<string>()
const fkDelete = ref<ReferentialAction>('no action')
const fkUpdate = ref<ReferentialAction>('no action')
const tableOptions = computed(() => props.tables.filter((tb) => tb.kind === 'table').map((tb) => ({ value: tb.name, label: tb.name })))
const refTable = computed(() => props.tables.find((tb) => tb.name === fkTable.value) ?? null)
const refColumnOptions = computed(() => (refTable.value?.columns ?? []).map((c) => ({ value: c.name, label: `${c.name} · ${c.nativeType}` })))
watch(refTable, (tb) => {
  fkRefColumn.value = tb?.primaryKey.length === 1 ? tb.primaryKey[0] : tb?.columns[0]?.name
})
const actionOptions = computed(() => REFERENTIAL_ACTIONS.map((a) => ({ value: a, label: a.toUpperCase() })))
const columnOptions = computed(() => columnNames.value.map((c) => ({ value: c, label: c })))
function addForeignKey(): void {
  if (!fkColumn.value || !fkTable.value) return
  draft.value.foreignKeys.push({
    from: null,
    name: foreignKeyName(draft.value.name.trim() || 'table', [fkColumn.value]),
    columns: [fkColumn.value],
    refTable: fkTable.value,
    refColumns: fkRefColumn.value ? [fkRefColumn.value] : [],
    onDelete: fkDelete.value,
    onUpdate: fkUpdate.value,
  })
  fkColumn.value = undefined
  fkTable.value = undefined
}

function errorText(e: DraftError): string {
  return t(`structure.errors.${e.code}`, e as Record<string, unknown>)
}
</script>

<template>
  <div class="grid gap-4" data-structure-editor>
    <label class="grid max-w-sm gap-1 text-xs text-fg-muted">
      {{ t('structure.tableName') }}
      <UiInput v-model="draft.name" mono data-table-name :data-autofocus="isNew || undefined" />
    </label>

    <div>
      <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('tableView.columns') }}</h3>
      <datalist :id="typeList">
        <option v-for="type in types" :key="type" :value="type" />
      </datalist>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-left text-sm">
          <thead class="bg-bg-subtle text-xs text-fg-muted">
            <tr>
              <th class="px-2 py-1 font-medium">{{ t('common.name') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('tableView.type') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('schemaTree.nullable') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('tableView.default') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('structure.key') }}</th>
              <th class="w-8 px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(col, i) in draft.columns"
              :key="col.from ?? `new-${i}`"
              class="border-t border-border align-top"
              :class="col.from === null && 'bg-accent/5'"
              data-column-row
              :data-column="col.name"
            >
              <td class="min-w-36 px-2 py-1">
                <UiInput :model-value="col.name" mono data-column-name @update:model-value="(v) => rename(col, String(v ?? ''))" />
                <p v-if="col.from && col.from !== col.name.trim()" class="font-data mt-0.5 text-[11px] text-fg-subtle">
                  {{ t('structure.was', { name: col.from }) }}
                </p>
              </td>
              <td class="min-w-36 px-2 py-1">
                <UiBadge v-if="col.computed" tone="neutral">{{ t('tableView.generated') }}</UiBadge>
                <UiInput v-else v-model="col.type" mono :list="typeList" data-column-type />
              </td>
              <td class="px-2 py-1.5">
                <UiCheckbox
                  v-model="col.nullable"
                  :disabled="col.computed || draft.primaryKey.includes(col.name)"
                  :aria-label="t('schemaTree.nullable')"
                  data-column-nullable
                />
              </td>
              <td class="min-w-32 px-2 py-1">
                <UiInput
                  v-if="!col.computed && !col.identity"
                  :model-value="col.default ?? ''"
                  mono
                  :placeholder="t('structure.defaultPlaceholder')"
                  data-column-default
                  @update:model-value="(v) => setDefault(col, v)"
                />
                <UiBadge v-else-if="col.identity" tone="neutral">{{ t('structure.identity') }}</UiBadge>
              </td>
              <td class="px-2 py-1.5">
                <div v-if="isNew" class="flex items-center gap-3">
                  <UiCheckbox
                    :model-value="draft.primaryKey.includes(col.name)"
                    :label="t('structure.primaryKey')"
                    class="text-xs!"
                    @update:model-value="(v) => togglePrimary(col, v === true)"
                  />
                  <UiCheckbox
                    v-if="draft.primaryKey.includes(col.name) && draft.primaryKey.length === 1"
                    v-model="col.identity"
                    :label="t('structure.autoIncrement')"
                    class="text-xs!"
                  />
                </div>
                <Icon
                  v-else-if="draft.primaryKey.includes(col.from ?? '')"
                  name="lucide:key-round"
                  class="size-3.5 text-warning"
                  :aria-label="t('schemaTree.primaryKey')"
                />
              </td>
              <td class="px-1 py-1">
                <UiIconButton icon="lucide:trash-2" size="sm" :label="t('structure.removeColumn', { name: col.name })" data-remove-column @click="removeColumn(col)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiButton size="sm" variant="ghost" class="mt-1" data-add-column @click="addColumn">
        <Icon name="lucide:plus" class="size-3.5" />{{ t('structure.addColumn') }}
      </UiButton>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('structure.indexes') }}</h3>
        <ul class="grid gap-1">
          <li v-if="draft.indexes.length === 0" class="text-sm text-fg-subtle">{{ t('structure.noIndexes') }}</li>
          <li
            v-for="(index, i) in draft.indexes"
            :key="index.from ?? `new-${i}`"
            class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
            :class="index.from === null && 'border-accent/40 bg-accent/5'"
            :data-index="index.name"
          >
            <span class="font-data min-w-0 flex-1 truncate text-fg" :title="index.name">{{ index.name }}</span>
            <span class="font-data truncate text-xs text-fg-muted">({{ index.columns.join(', ') }})</span>
            <UiBadge v-if="index.unique" tone="accent">{{ t('tableView.unique') }}</UiBadge>
            <UiIconButton icon="lucide:trash-2" size="sm" :label="t('structure.remove')" @click="draft.indexes.splice(i, 1)" />
          </li>
        </ul>
        <div class="mt-2 grid gap-2 rounded-md border border-dashed border-border p-2" data-new-index>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <UiCheckbox
              v-for="name in columnNames"
              :key="name"
              :model-value="indexColumns.includes(name)"
              :label="name"
              class="font-data text-xs!"
              @update:model-value="(v) => toggleIndexColumn(name, v === true)"
            />
          </div>
          <div class="flex items-center gap-3">
            <UiCheckbox v-model="indexUnique" :label="t('tableView.unique')" class="text-xs!" />
            <UiButton size="sm" class="ml-auto" :disabled="indexColumns.length === 0" data-add-index @click="addIndex">
              <Icon name="lucide:plus" class="size-3.5" />{{ t('structure.addIndex') }}
            </UiButton>
          </div>
        </div>
      </div>

      <div>
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('structure.foreignKeys') }}</h3>
        <ul class="grid gap-1">
          <li v-if="draft.foreignKeys.length === 0" class="text-sm text-fg-subtle">{{ t('structure.noForeignKeys') }}</li>
          <li
            v-for="(fk, i) in draft.foreignKeys"
            :key="fk.from ?? `new-${i}`"
            class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
            :class="fk.from === null && 'border-accent/40 bg-accent/5'"
            :data-foreign-key="fk.columns.join(',')"
          >
            <span class="font-data min-w-0 flex-1 truncate text-fg">
              {{ fk.columns.join(', ') }} → {{ fk.refTable }}<template v-if="fk.refColumns.length">({{ fk.refColumns.join(', ') }})</template>
            </span>
            <span class="text-[11px] text-fg-subtle">{{ t('structure.onDelete', { action: fk.onDelete.toUpperCase() }) }}</span>
            <UiIconButton icon="lucide:trash-2" size="sm" :label="t('structure.remove')" @click="draft.foreignKeys.splice(i, 1)" />
          </li>
        </ul>
        <div class="mt-2 grid gap-2 rounded-md border border-dashed border-border p-2" data-new-foreign-key>
          <div class="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <UiSelect v-model="fkColumn" :options="columnOptions" :placeholder="t('structure.fkColumn')" data-fk-column />
            <Icon name="lucide:arrow-right" class="size-3.5" />
            <UiSelect v-model="fkTable" :options="tableOptions" :placeholder="t('structure.fkTable')" data-fk-table />
            <UiSelect v-if="refTable" v-model="fkRefColumn" :options="refColumnOptions" :placeholder="t('structure.fkRefColumn')" />
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            {{ t('structure.onDeleteLabel') }}
            <UiSelect v-model="fkDelete" :options="actionOptions" />
            {{ t('structure.onUpdateLabel') }}
            <UiSelect v-model="fkUpdate" :options="actionOptions" />
            <UiButton size="sm" class="ml-auto" :disabled="!fkColumn || !fkTable" data-add-fk @click="addForeignKey">
              <Icon name="lucide:plus" class="size-3.5" />{{ t('structure.addForeignKey') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <ul v-if="errors.length" class="grid gap-0.5 text-xs text-danger" data-structure-errors>
      <li v-for="(e, i) in errors" :key="i">{{ errorText(e) }}</li>
    </ul>
  </div>
</template>
