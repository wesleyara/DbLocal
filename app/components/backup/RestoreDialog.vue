<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import type { RestoreEvent } from '#shared/types/backup'
import { usePendingStore } from '~/stores/pending-changes'
import { useRoutinesStore } from '~/stores/routines'
import { useSchemaStore } from '~/stores/schema'

/**
 * Runs a `.sql` file (a DbLocal dump or any script) against a connection, statement by statement,
 * with progress. Stops at the first error; what ran before it stays.
 */
const props = defineProps<{ connection: ConnectionView; schema?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const { number } = useFormat()
const toast = useToast()

const defaultSchema = computed(() => props.connection.defaultSchema ?? (props.connection.dialect === 'postgres' ? 'public' : props.connection.dialect === 'sqlite' ? 'main' : (props.connection.database ?? '')))
const readonly = computed(() => props.connection.readonly || props.connection.readonlyGlobal)
const prod = computed(() => props.connection.environment === 'prod')
const schemaName = ref('')
const file = ref<File | null>(null)
const confirmed = ref(false)
const running = ref(false)
const progress = ref<{ done: number; total: number } | null>(null)
const error = ref<{ index: number; sql: string; message: string } | null>(null)
const result = ref<Extract<RestoreEvent, { type: 'done' }> | null>(null)
const failure = ref<string | null>(null)
let controller: AbortController | null = null

watch(open, (value) => {
  if (value) {
    schemaName.value = props.schema || defaultSchema.value
    file.value = null
    confirmed.value = false
    reset()
  } else controller?.abort()
})
function reset(): void {
  progress.value = null
  error.value = null
  result.value = null
  failure.value = null
}

function onFile(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  reset()
}

const canRun = computed(() => !!file.value && !running.value && !readonly.value && (!prod.value || confirmed.value))
const percent = computed(() => (progress.value && progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0))

async function restore(): Promise<void> {
  if (!file.value || !canRun.value) return
  reset()
  running.value = true
  controller = new AbortController()
  try {
    const query = new URLSearchParams()
    if (schemaName.value) query.set('schema', schemaName.value)
    if (prod.value) query.set('confirm', '1')
    const res = await fetch(`/api/c/${props.connection.id}/restore?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sql' },
      body: await file.value.text(),
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
      <UiCheckbox v-if="prod" v-model="confirmed" :label="t('backup.restore.confirmProd', { name: connection.name })" data-restore-confirm />
      <p class="text-xs text-fg-subtle">{{ t('backup.restore.hint') }}</p>

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
      <UiButton :variant="prod ? 'danger' : 'primary'" :loading="running" :disabled="!canRun" data-restore-run @click="restore">
        <Icon name="lucide:upload" class="size-3.5" />{{ t('backup.restore.run') }}
      </UiButton>
    </template>
  </UiDialog>
</template>
