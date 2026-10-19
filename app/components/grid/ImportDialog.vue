<script setup lang="ts">
import type { SchemaTable } from '#shared/types/db'
import type { MutationErrorItem, MutationOp, MutationResponse } from '#shared/types/mutations'
import { useUiStore } from '~/stores/ui'
import { editableKey } from '#shared/editable'
import {
  autoMapping,
  batches,
  buildImportOps,
  importableColumns,
  missingColumns,
  type ImportCellErrorCode,
  type ImportMapping,
  type ImportMode,
} from '#shared/import-map'
import { detectDelimiter, detectFormat, parseImport, type CsvDelimiter, type ImportData, type ImportFormat, type ParseError } from '#shared/import-parse'
import { useConnectionErrors } from '~/composables/useConnectionErrors'
import { useToast } from '~/composables/useToast'

/**
 * Imports a CSV or JSON file into the table: the file is parsed in the browser, its columns are
 * mapped to the table's, every cell is checked like a typed value, and the rows go to the
 * mutations endpoint in batches. All batches are validated by the server (dry run) before the
 * first one is written; each batch is then one transaction.
 */
const props = defineProps<{
  connectionId: string
  schema: string
  table: SchemaTable
  connectionName: string
  environment: 'local' | 'staging' | 'prod'
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const { t } = useI18n()
const { number } = useFormat()
const toast = useToast()
const errors = useConnectionErrors()

/** Bigger files make the tab sluggish: the whole text and its rows live in memory. */
const MAX_BYTES = 50 * 1024 * 1024
const SKIP = '__skip__'
const PREVIEW_ROWS = 5
const ERRORS_SHOWN = 20

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const text = ref('')
const format = ref<ImportFormat>('csv')
const delimiter = ref<CsvDelimiter>(',')
const parseError = ref<ParseError | 'tooBig' | 'read' | null>(null)
const data = ref<ImportData | null>(null)
const mapping = ref<ImportMapping>({})
const mode = ref<ImportMode>('insert')
const emptyAsNull = ref(true)
const skipInvalid = ref(false)
const dragging = ref(false)

const running = ref(false)
const phase = ref<'check' | 'write'>('check')
const done = ref(0)
const failure = ref<string | null>(null)
const confirmProd = ref(false)
const typedName = ref('')

function reset(): void {
  fileName.value = ''
  text.value = ''
  data.value = null
  parseError.value = null
  mapping.value = {}
  failure.value = null
  done.value = 0
  if (fileInput.value) fileInput.value.value = ''
}
watch(open, (isOpen) => isOpen && !running.value && reset())

function parse(): void {
  failure.value = null
  const res = parseImport(text.value, format.value, delimiter.value)
  if (!res.ok) {
    data.value = null
    parseError.value = res.error
    return
  }
  parseError.value = null
  data.value = res.data
  mapping.value = autoMapping(res.data.columns, props.table)
}

async function load(file: File | undefined): Promise<void> {
  if (!file) return
  reset()
  fileName.value = file.name
  if (file.size > MAX_BYTES) {
    parseError.value = 'tooBig'
    return
  }
  try {
    text.value = await file.text()
  } catch {
    parseError.value = 'read'
    return
  }
  format.value = detectFormat(file.name, text.value)
  delimiter.value = detectDelimiter(text.value)
  parse()
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  void load(event.dataTransfer?.files[0])
}

const formatOptions = computed(() => [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
])
const delimiterOptions = computed(() => [
  { value: ',', label: t('import.delimiters.comma') },
  { value: ';', label: t('import.delimiters.semicolon') },
  { value: '\t', label: t('import.delimiters.tab') },
  { value: '|', label: t('import.delimiters.pipe') },
])
const modeOptions = computed(() => [
  { value: 'insert', label: t('import.modes.insert') },
  { value: 'upsert', label: t('import.modes.upsert', { key: (editableKey(props.table) ?? []).join(', ') }) },
])
const targetOptions = computed(() => [
  { value: SKIP, label: t('import.skipColumn') },
  ...importableColumns(props.table).map((c) => ({ value: c.name, label: `${c.name} · ${c.nativeType}` })),
])

function setTarget(fileColumn: string, value: string | undefined): void {
  const target = !value || value === SKIP ? null : value
  const next: ImportMapping = { ...mapping.value, [fileColumn]: target }
  // One table column takes one file column: the previous one is left out.
  if (target) for (const [name, mapped] of Object.entries(next)) if (name !== fileColumn && mapped === target) next[name] = null
  mapping.value = next
}

const mappedCount = computed(() => Object.values(mapping.value).filter(Boolean).length)
const missing = computed(() => missingColumns(props.table, mapping.value, mode.value))
const build = computed(() =>
  data.value ? buildImportOps(data.value, mapping.value, props.table, { mode: mode.value, emptyAsNull: emptyAsNull.value }) : null,
)
const previewRows = computed(() => data.value?.rows.slice(0, PREVIEW_ROWS) ?? [])

const ERROR_KEYS: Partial<Record<ImportCellErrorCode, string>> = { boolean: 'import.cellErrors.boolean', text: 'import.cellErrors.text' }
const cellError = (code: ImportCellErrorCode) => t(ERROR_KEYS[code] ?? `edit.errors.${code}`)
const shownErrors = computed(() => build.value?.errors.slice(0, ERRORS_SHOWN) ?? [])

const canImport = computed(
  () =>
    !!build.value &&
    !running.value &&
    mappedCount.value > 0 &&
    missing.value.length === 0 &&
    build.value.ops.length > 0 &&
    (build.value.invalidRows === 0 || skipInvalid.value),
)
const total = computed(() => build.value?.ops.length ?? 0)
const percent = computed(() => (total.value === 0 ? 0 : Math.round((done.value / total.value) * 100)))

function itemsOf(err: unknown): MutationErrorItem[] {
  const list = (err as { data?: { data?: { errors?: MutationErrorItem[] } } })?.data?.data?.errors
  return Array.isArray(list) ? list : []
}

/** "Row 12: ..." for a failed batch, with the row counted in the file (from 1). */
function describeFailure(err: unknown, offset: number, rows: number[]): string {
  const item = itemsOf(err)[0]
  if (!item) return errors.message(err)
  const row = rows[offset + item.index]
  return row === undefined ? item.message : t('import.rowFailed', { row: row + 1, message: item.message })
}

async function send(ops: MutationOp[], dryRun: boolean): Promise<MutationResponse> {
  return $fetch<MutationResponse>(`/api/c/${props.connectionId}/mutations`, {
    method: 'POST',
    body: { schema: props.schema, ops, dryRun },
  })
}

function requestImport(): void {
  if (!canImport.value) return
  // Upsert overwrites the rows that share a key with the file: confirmed like a prod write.
  if (props.environment === 'prod' || (mode.value === 'upsert' && useUiStore().doubleCheck)) {
    typedName.value = ''
    confirmProd.value = true
  } else void runImport()
}

async function runImport(): Promise<void> {
  confirmProd.value = false
  const plan = build.value
  if (!plan || running.value) return
  running.value = true
  failure.value = null
  done.value = 0
  const chunks = batches(plan.ops)
  let offset = 0
  try {
    // Nothing is written until every batch passes the server's checks (types, enums, keys).
    phase.value = 'check'
    for (const chunk of chunks) {
      try {
        await send(chunk, true)
      } catch (err) {
        failure.value = describeFailure(err, offset, plan.rows)
        return
      }
      offset += chunk.length
      done.value = offset
    }
    phase.value = 'write'
    offset = 0
    done.value = 0
    for (const chunk of chunks) {
      try {
        await send(chunk, false)
      } catch (err) {
        failure.value = describeFailure(err, offset, plan.rows)
        if (offset > 0) failure.value += ` ${t('import.partial', { count: number(offset) })}`
        if (offset > 0) emit('imported')
        return
      }
      offset += chunk.length
      done.value = offset
    }
    toast.push({
      kind: 'success',
      title: t('import.done', { count: number(offset) }, offset),
      description: plan.invalidRows > 0 ? t('import.skipped', { count: number(plan.invalidRows) }, plan.invalidRows) : undefined,
    })
    emit('imported')
    open.value = false
  } finally {
    running.value = false
  }
}
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('import.title', { table: table.name })" :description="t('import.description')">
    <div class="grid gap-3" data-import-dialog>
      <div
        class="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-3"
        :class="dragging ? 'border-accent bg-accent/5' : 'border-border'"
        data-import-drop
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl,text/csv,application/json"
          class="sr-only"
          data-import-file
          @change="load(($event.target as HTMLInputElement).files?.[0])"
        >
        <UiButton size="sm" :disabled="running" @click="fileInput?.click()">
          <Icon name="lucide:file-up" class="size-3.5" />{{ t('import.choose') }}
        </UiButton>
        <span v-if="fileName" class="font-data min-w-0 truncate text-xs text-fg" :title="fileName">{{ fileName }}</span>
        <span v-else class="text-xs text-fg-subtle">{{ t('import.drop') }}</span>
        <span v-if="data" class="text-xs text-fg-muted" data-import-count>
          {{ t('import.records', { count: number(data.rows.length) }, data.rows.length) }}
        </span>
        <div v-if="fileName && parseError !== 'tooBig' && parseError !== 'read'" class="ml-auto flex items-center gap-2">
          <UiSelect v-model="format" :options="formatOptions" :aria-label="t('import.format')" @update:model-value="parse" />
          <UiSelect
            v-if="format === 'csv'"
            v-model="delimiter"
            :options="delimiterOptions"
            :aria-label="t('import.delimiter')"
            @update:model-value="parse"
          />
        </div>
      </div>

      <p v-if="parseError" class="text-xs text-danger" data-import-error>{{ t(`import.parseErrors.${parseError}`) }}</p>

      <template v-if="data && build">
        <div class="grid gap-1">
          <h3 class="text-xs font-medium text-fg-muted">{{ t('import.mapping') }}</h3>
          <div class="max-h-64 overflow-auto rounded-md border border-border">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-bg-subtle text-left text-fg-subtle">
                <tr>
                  <th class="px-2 py-1 font-medium">{{ t('import.fileColumn') }}</th>
                  <th class="px-2 py-1 font-medium">{{ t('import.sample') }}</th>
                  <th class="px-2 py-1 font-medium">{{ t('import.tableColumn') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(name, c) in data.columns" :key="name" class="border-t border-border" :data-import-map="name">
                  <td class="font-data px-2 py-1 text-fg">{{ name }}</td>
                  <td class="font-data max-w-64 truncate px-2 py-1 text-fg-muted">
                    {{ previewRows.map((r) => (r[c] === undefined || r[c] === null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c]))).filter(Boolean).slice(0, 3).join(' · ') }}
                  </td>
                  <td class="px-2 py-1">
                    <UiSelect
                      :model-value="mapping[name] ?? SKIP"
                      :options="targetOptions"
                      @update:model-value="(v) => setTarget(name, v)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label class="flex items-center gap-2 text-xs text-fg-muted" data-import-mode>
            {{ t('import.mode') }}
            <UiSelect v-model="mode" :options="modeOptions" />
          </label>
          <UiCheckbox v-model="emptyAsNull" class="text-xs!" :label="t('import.emptyAsNull')" />
          <UiCheckbox v-if="build.invalidRows > 0" v-model="skipInvalid" class="text-xs!" :label="t('import.skipInvalid')" data-import-skip-invalid />
          <HelpHint id="grid.import" />
        </div>

        <p v-if="mappedCount === 0" class="text-xs text-warning">{{ t('import.noMapping') }}</p>
        <p v-else-if="missing.length" class="text-xs text-warning" data-import-missing>
          {{ t('import.missing', { columns: missing.join(', ') }) }}
        </p>

        <!-- Blocking (danger) until "Skip invalid records" is ticked; then only a warning. -->
        <div
          v-if="build.errors.length"
          class="grid gap-1 rounded-md border p-2"
          :class="skipInvalid ? 'border-warning/40 bg-warning-soft' : 'border-danger/40 bg-danger-soft'"
          data-import-invalid
        >
          <p class="text-xs font-medium" :class="skipInvalid ? 'text-warning' : 'text-danger'">
            {{ t(skipInvalid ? 'import.willSkip' : 'import.invalid', { count: number(build.invalidRows) }, build.invalidRows) }}
          </p>
          <ul class="max-h-32 overflow-auto text-xs text-fg-muted">
            <li v-for="e in shownErrors" :key="`${e.row}:${e.column}`">
              {{ t('import.cellError', { row: e.row + 1, column: e.column, message: cellError(e.code) }) }}
            </li>
            <li v-if="build.errors.length > shownErrors.length" class="text-fg-subtle">
              {{ t('import.moreErrors', { count: number(build.errors.length - shownErrors.length) }) }}
            </li>
          </ul>
        </div>

        <div v-if="running" class="grid gap-1" data-import-progress>
          <div class="h-1.5 overflow-hidden rounded-full bg-bg-subtle">
            <div class="h-full bg-accent transition-[width]" :style="{ width: `${percent}%` }" />
          </div>
          <p class="text-xs text-fg-muted">
            {{ t(phase === 'check' ? 'import.checking' : 'import.writing', { done: number(done), total: number(total) }) }}
          </p>
        </div>
        <p v-if="failure" class="text-xs text-danger" data-import-failure>{{ failure }}</p>
      </template>
    </div>

    <template #footer>
      <UiButton @click="open = false">{{ t('common.cancel') }}</UiButton>
      <UiButton variant="primary" :disabled="!canImport" :loading="running" data-import-run @click="requestImport">
        {{ t('import.run', { count: number(total) }, total) }}
      </UiButton>
    </template>
  </UiDialog>

  <UiDialog
    v-model:open="confirmProd"
    :title="environment === 'prod' ? t('edit.prodTitle') : t('import.upsertTitle')"
    :description="t('import.prodBody', { count: number(total), name: connectionName }, total)"
  >
    <p v-if="mode === 'upsert'" class="mb-3 flex items-center gap-2 rounded-md border border-warning/50 bg-warning-soft p-2 text-xs text-warning" role="alert" data-import-upsert-warning>
      <Icon name="lucide:triangle-alert" class="size-4 shrink-0" />{{ t('import.upsertWarning', { key: (editableKey(table) ?? []).join(', ') }) }}
    </p>
    <UiInput v-model="typedName" mono :placeholder="connectionName" :aria-label="t('edit.prodType', { name: connectionName })" data-prod-confirm />
    <template #footer>
      <UiButton size="sm" @click="confirmProd = false">{{ t('common.cancel') }}</UiButton>
      <UiButton size="sm" variant="danger" :disabled="typedName.trim() !== connectionName" @click="runImport">
        {{ t('import.run', { count: number(total) }, total) }}
      </UiButton>
    </template>
  </UiDialog>
</template>
