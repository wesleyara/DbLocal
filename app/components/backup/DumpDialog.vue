<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import type { SchemaResponse } from '#shared/types/db'
import { downloadFrom, saveBlob } from '~/composables/useDownload'

/**
 * Backup of a connection: a logical dump (`.sql`, structure and/or data, all or some tables) that
 * Restore reads back, or for a SQLite file a binary copy of the file.
 */
const props = defineProps<{ connection: ConnectionView; schema?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const toast = useToast()

const defaultSchema = computed(() => props.connection.defaultSchema ?? (props.connection.dialect === 'postgres' ? 'public' : props.connection.dialect === 'sqlite' ? 'main' : (props.connection.database ?? '')))
const schemaName = ref('')
const structure = ref(true)
const data = ref(true)
const pick = ref(false)
const tables = ref<string[] | null>(null)
const chosen = ref(new Set<string>())
const loadingTables = ref(false)
const busy = ref<'dump' | 'file' | null>(null)
const failure = ref<string | null>(null)
const isSqliteFile = computed(() => props.connection.dialect === 'sqlite' && !!props.connection.filePath)

watch(open, (value) => {
  if (!value) return
  schemaName.value = props.schema || defaultSchema.value
  pick.value = false
  tables.value = null
  failure.value = null
})

async function loadTables(): Promise<void> {
  loadingTables.value = true
  try {
    const res = await $fetch<SchemaResponse>(`/api/c/${props.connection.id}/schema`, { query: { schema: schemaName.value || undefined } })
    tables.value = res.snapshot.tables.filter((tb) => tb.kind === 'table').map((tb) => tb.name)
    chosen.value = new Set(tables.value)
  } catch (err) {
    failure.value = errorText(err)
  } finally {
    loadingTables.value = false
  }
}
watch(pick, (value) => {
  if (value && !tables.value) void loadTables()
})
watch(schemaName, () => (tables.value = null))

function toggle(name: string, on: boolean | 'indeterminate'): void {
  const next = new Set(chosen.value)
  if (on === true) next.add(name)
  else next.delete(name)
  chosen.value = next
}

const errorText = (err: unknown) => {
  const e = err as { data?: { message?: string; statusMessage?: string }; statusMessage?: string; message?: string }
  return e.data?.message ?? e.data?.statusMessage ?? e.statusMessage ?? e.message ?? String(err)
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
const canDump = computed(() => (structure.value || data.value) && (!pick.value || chosen.value.size > 0))

async function dump(): Promise<void> {
  busy.value = 'dump'
  failure.value = null
  try {
    await downloadFrom(
      `/api/c/${props.connection.id}/dump`,
      { schema: schemaName.value || undefined, structure: structure.value, data: data.value, tables: pick.value ? [...chosen.value] : undefined },
      `${props.connection.name}-${schemaName.value || 'dump'}-${stamp()}.sql`,
    )
    toast.push({ kind: 'success', title: t('backup.dump.done') })
    open.value = false
  } catch (err) {
    failure.value = errorText(err)
  } finally {
    busy.value = null
  }
}

async function copyFile(): Promise<void> {
  busy.value = 'file'
  failure.value = null
  try {
    const blob = await $fetch<Blob>(`/api/c/${props.connection.id}/backup`, { responseType: 'blob' })
    saveBlob(blob, `${props.connection.name.replace(/\.(sqlite3?|db)$/i, '')}-${stamp()}.sqlite`)
    open.value = false
  } catch (err) {
    failure.value = errorText(err)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('backup.dump.title', { name: connection.name })" :description="t('backup.dump.description')">
    <div class="flex flex-col gap-4" data-dump-dialog>
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ connection.dialect === 'postgres' ? t('backup.schema') : t('backup.database') }}
        <UiInput v-model="schemaName" mono data-dump-schema />
      </label>
      <div class="flex flex-wrap gap-4">
        <UiCheckbox v-model="structure" :label="t('backup.dump.structure')" data-dump-structure />
        <UiCheckbox v-model="data" :label="t('backup.dump.data')" data-dump-data />
      </div>
      <div class="flex flex-col gap-2">
        <UiSwitch v-model="pick" :label="t('backup.dump.pickTables')" data-dump-pick />
        <div v-if="pick" class="max-h-48 overflow-auto rounded-md border border-border p-2">
          <div v-if="loadingTables" class="grid gap-1.5">
            <UiSkeleton v-for="n in 4" :key="n" class="h-4 w-1/2" />
          </div>
          <div v-else-if="tables" class="grid grid-cols-2 gap-1.5">
            <UiCheckbox
              v-for="name in tables"
              :key="name"
              :model-value="chosen.has(name)"
              :label="name"
              class="font-data"
              @update:model-value="(v) => toggle(name, v ?? false)"
            />
          </div>
        </div>
        <p v-if="pick" class="text-xs text-fg-subtle">{{ t('backup.dump.pickHint') }}</p>
      </div>
      <p v-if="failure" class="rounded-md border border-danger/40 bg-danger-soft p-2 text-xs break-words text-danger" data-dump-error>{{ failure }}</p>
    </div>
    <template #footer>
      <UiButton v-if="isSqliteFile" :loading="busy === 'file'" :disabled="busy !== null" data-backup-file @click="copyFile">
        <Icon name="lucide:file-down" class="size-3.5" />{{ t('backup.dump.file') }}
      </UiButton>
      <UiButton variant="primary" :loading="busy === 'dump'" :disabled="busy !== null || !canDump" data-dump-run @click="dump">
        <Icon name="lucide:download" class="size-3.5" />{{ t('backup.dump.run') }}
      </UiButton>
    </template>
  </UiDialog>
</template>
