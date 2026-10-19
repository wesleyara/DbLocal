<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import type { RestoreEvent } from '#shared/types/backup'
import { assessScript, type StatementRisk } from '#shared/sql-risk'
import { splitStatements } from '#shared/sql-split'
import { usePendingStore } from '~/stores/pending-changes'
import { useUiStore } from '~/stores/ui'
import { useRoutinesStore } from '~/stores/routines'
import { useSchemaStore } from '~/stores/schema'

/**
 * Runs a `.sql` file (a DbLocal dump or any script) against a connection, statement by statement,
 * with progress. Stops at the first error; what ran before it stays. Two checks first: a review of
 * the file (statement count, destructive statements spelled out) and the connection's name typed.
 */
const props = defineProps<{ connection: ConnectionView; schema?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const { number } = useFormat()
const toast = useToast()

const defaultSchema = computed(() => props.connection.defaultSchema || (props.connection.dialect === 'postgres' ? 'public' : props.connection.dialect === 'sqlite' ? 'main' : (props.connection.database || '')))
const readonly = computed(() => props.connection.readonly || props.connection.readonlyGlobal)
const prod = computed(() => props.connection.environment === 'prod')
const schemaName = ref('')
const file = ref<File | null>(null)
const typedName = ref('')
/** The file read and assessed: shown before the name can be typed. */
const review = ref<{ text: string; statements: number; risks: StatementRisk[] } | null>(null)
const reviewing = ref(false)
const running = ref(false)
const progress = ref<{ done: number; total: number } | null>(null)
const error = ref<{ index: number; sql: string; message: string } | null>(null)
const result = ref<Extract<RestoreEvent, { type: 'done' }> | null>(null)
const failure = ref<string | null>(null)
let controller: AbortController | null = null

// Immediate: the dialog is often mounted already open.
watch(
  open,
  (value) => {
    if (value) {
      schemaName.value = props.schema || defaultSchema.value
      file.value = null
      typedName.value = ''
      review.value = null
      reset()
    } else controller?.abort()
  },
  { immediate: true },
)
function reset(): void {
  progress.value = null
  error.value = null
  result.value = null
  failure.value = null
}

function onFile(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  review.value = null
  typedName.value = ''
  reset()
}

async function reviewFile(): Promise<void> {
  if (!file.value) return
  reviewing.value = true
  try {
    const text = await file.value.text()
    review.value = { text, statements: splitStatements(text, props.connection.dialect).length, risks: assessScript(text, props.connection.dialect) }
  } finally {
    reviewing.value = false
  }
}
const dangerous = computed(() => review.value?.risks.filter((r) => r.level === 'danger') ?? [])
const riskText = (r: StatementRisk) =>
  t(`query.risk.${r.kind}`, { target: r.target ?? '', object: r.object ? t(`query.risk.objects.${r.object.replace(' ', '_')}`, r.object) : '' })

const ui = useUiStore()
/** The name is asked unless the "double check" setting is off (always on prod). */
const needsName = computed(() => ui.doubleCheck || prod.value)
const canRun = computed(
  () =>
    !!review.value &&
    !running.value &&
    !readonly.value &&
    review.value.statements > 0 &&
    (!needsName.value || typedName.value.trim() === props.connection.name),
)
const percent = computed(() => (progress.value && progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0))

async function restore(): Promise<void> {
  if (!review.value || !canRun.value) return
  reset()
  running.value = true
  controller = new AbortController()
  try {
    const query = new URLSearchParams()
    if (schemaName.value) query.set('schema', schemaName.value)
    // Both checks were passed in the dialog (review + name); the server refuses without it.
    query.set('confirm', '1')
    const res = await fetch(`/api/c/${props.connection.id}/restore?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sql' },
      body: review.value.text,
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { data?: { message?: string }; statusMessage?: string } | null
      failure.value = body?.data?.message ?? body?.statusMessage ?? res.statusText
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const handle = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as RestoreEvent
      if (event.type === 'start') progress.value = { done: 0, total: event.total }
      else if (event.type === 'progress') progress.value = { done: event.done, total: event.total }
      else if (event.type === 'error') error.value = event
      else if (event.type === 'done') result.value = event
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(handle)
    }
    handle(buffer)
    if (result.value && !result.value.failed) toast.push({ kind: 'success', title: t('backup.restore.done', { count: number(result.value.executed) }) })
  } catch (err) {
    if ((err as Error).name !== 'AbortError') failure.value = (err as Error).message
  } finally {
    running.value = false
    controller = null
    // Tables, routines and rows may all have changed.
    usePendingStore().version++
    const schemaStore = useSchemaStore()
    if (schemaStore.connectionId === props.connection.id) void schemaStore.load(props.connection.id, schemaStore.schema, true).catch(() => {})
    const routines = useRoutinesStore()
    if (schemaName.value) void routines.load(props.connection.id, schemaName.value)
  }
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('backup.restore.title', { name: connection.name })" :description="t('backup.restore.description')">
    <div class="flex flex-col gap-4" data-restore-dialog>
      <p v-if="readonly" class="flex items-center gap-1.5 text-sm text-warning">
        <Icon name="lucide:lock" class="size-3.5" />{{ t('backup.restore.readonly') }}
      </p>
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ connection.dialect === 'postgres' ? t('backup.schema') : t('backup.database') }}
        <UiInput v-model="schemaName" mono :disabled="running" data-restore-schema />
      </label>
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ t('backup.restore.file') }}
        <input
          type="file"
          accept=".sql,text/plain,application/sql"
          class="text-sm text-fg file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-sm file:text-fg"
          :disabled="running"
          data-restore-file
          @change="onFile"
        >
      </label>
      <p class="text-xs text-fg-subtle">{{ t('backup.restore.hint') }}</p>

      <div v-if="review" class="grid gap-2" data-restore-review>
        <div
          class="flex gap-2 rounded-md border p-2 text-xs"
          :class="dangerous.length || prod ? 'border-danger/50 bg-danger-soft text-danger' : 'border-warning/50 bg-warning-soft text-warning'"
          role="alert"
        >
          <Icon name="lucide:triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <div class="grid gap-1">
            <p class="font-medium">
              {{ t('backup.restore.reviewHeading', { count: number(review.statements), name: connection.name, schema: schemaName || '—' }, review.statements) }}
            </p>
            <p v-if="prod">{{ t('backup.restore.prodWarning') }}</p>
            <template v-if="dangerous.length">
              <p>{{ t('backup.restore.destructive', { count: dangerous.length }, dangerous.length) }}</p>
              <ul class="max-h-28 overflow-auto">
                <li v-for="r in dangerous.slice(0, 50)" :key="r.index" :data-risk="r.kind">{{ t('backup.restore.statementN', { n: r.index + 1 }) }} {{ riskText(r) }}</li>
              </ul>
            </template>
            <p>{{ t('backup.restore.noUndo') }}</p>
          </div>
        </div>
        <label v-if="needsName" class="grid gap-1 text-xs text-fg-muted">
          {{ t('query.risk.typeName', { name: connection.name }) }}
          <UiInput v-model="typedName" mono :placeholder="connection.name" autocomplete="off" :disabled="running" data-restore-confirm-name />
        </label>
      </div>

      <div v-if="progress" class="grid gap-1" data-restore-progress>
        <div class="h-1.5 overflow-hidden rounded-full bg-bg-subtle">
          <div class="h-full bg-accent transition-[width]" :style="{ width: `${percent}%` }" />
        </div>
        <span class="font-data text-xs text-fg-muted">{{ t('backup.restore.progress', { done: number(progress.done), total: number(progress.total) }) }}</span>
      </div>
      <div v-if="error" class="grid gap-1 rounded-md border border-danger/40 bg-danger-soft p-2 text-xs text-danger" data-restore-error>
        <span>{{ t('backup.restore.failedAt', { index: number(error.index + 1) }) }} {{ error.message }}</span>
        <pre class="font-data max-h-32 overflow-auto break-all whitespace-pre-wrap text-fg">{{ error.sql }}</pre>
      </div>
      <p v-if="result && !result.failed" class="text-sm text-success" data-restore-done>
        {{ t('backup.restore.done', { count: number(result.executed) }) }}
      </p>
      <p v-if="failure" class="rounded-md border border-danger/40 bg-danger-soft p-2 text-xs break-words text-danger">{{ failure }}</p>
    </div>
    <template #footer>
      <UiButton @click="open = false">{{ t('common.close') }}</UiButton>
      <UiButton v-if="!review" variant="primary" :loading="reviewing" :disabled="!file || readonly" data-restore-review-run @click="reviewFile">
        <Icon name="lucide:search-check" class="size-3.5" />{{ t('backup.restore.review') }}
      </UiButton>
      <UiButton v-else variant="danger" :loading="running" :disabled="!canRun" data-restore-run @click="restore">
        <Icon name="lucide:upload" class="size-3.5" />{{ t('backup.restore.run') }}
      </UiButton>
    </template>
  </UiDialog>
</template>
