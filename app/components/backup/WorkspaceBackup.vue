<script setup lang="ts">
import type { WorkspaceBackup, WorkspaceImportResult } from '#shared/types/backup'
import { saveBlob } from '~/composables/useDownload'

/**
 * Export / import of DbLocal's own data (connections, saved queries, notes, layouts). A password
 * carries the connection secrets to another installation; without one they are left out.
 */
const { t } = useI18n()
const toast = useToast()

const exportPassword = ref('')
const history = ref(false)
const exporting = ref(false)
const importPassword = ref('')
const pending = ref<WorkspaceBackup | null>(null)
const importing = ref(false)
const result = ref<WorkspaceImportResult | null>(null)
const failure = ref<string | null>(null)

const errorText = (err: unknown) => {
  const e = err as { data?: { data?: { message?: string; code?: string }; message?: string }; message?: string }
  if (e.data?.data?.code === 'password') return t('backup.workspace.wrongPassword')
  return e.data?.data?.message ?? e.data?.message ?? e.message ?? String(err)
}

const passwordTooShort = computed(() => exportPassword.value.length > 0 && exportPassword.value.length < 8)

async function exportNow(): Promise<void> {
  exporting.value = true
  failure.value = null
  try {
    const blob = await $fetch<Blob>('/api/workspace/export', {
      method: 'POST',
      body: { password: exportPassword.value || undefined, history: history.value },
      responseType: 'blob',
    })
    saveBlob(blob, `dblocal-workspace-${new Date().toISOString().slice(0, 10)}.json`)
    exportPassword.value = ''
  } catch (err) {
    failure.value = errorText(err)
  } finally {
    exporting.value = false
  }
}

async function onFile(event: Event): Promise<void> {
  result.value = null
  failure.value = null
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    pending.value = null
    return
  }
  try {
    const parsed = JSON.parse(await file.text()) as WorkspaceBackup
    if (parsed.format !== 'dblocal-workspace') throw new Error(t('backup.workspace.notBackup'))
    pending.value = parsed
  } catch (err) {
    pending.value = null
    failure.value = err instanceof SyntaxError ? t('backup.workspace.notBackup') : (err as Error).message
  }
}

async function importNow(): Promise<void> {
  if (!pending.value) return
  importing.value = true
  failure.value = null
  try {
    result.value = await $fetch<WorkspaceImportResult>('/api/workspace/import', {
      method: 'POST',
      body: { backup: pending.value, password: importPassword.value || undefined },
    })
    toast.push({ kind: 'success', title: t('backup.workspace.imported') })
    refreshNuxtData()
  } catch (err) {
    failure.value = errorText(err)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <section data-workspace-backup>
    <h3 class="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">
      {{ t('backup.workspace.title') }}<HelpHint id="backup.workspace" />
    </h3>
    <p class="mb-3 text-xs text-fg-muted">{{ t('backup.workspace.description') }}</p>

    <div class="grid gap-2">
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ t('backup.workspace.password') }}
        <UiInput v-model="exportPassword" type="password" autocomplete="new-password" :invalid="passwordTooShort" data-workspace-password />
      </label>
      <p class="text-xs" :class="passwordTooShort ? 'text-danger' : 'text-fg-subtle'">
        {{ passwordTooShort ? t('backup.workspace.passwordShort') : t('backup.workspace.passwordHint') }}
      </p>
      <div class="flex items-center justify-between gap-3">
        <UiCheckbox v-model="history" :label="t('backup.workspace.history')" />
        <UiButton size="sm" :loading="exporting" :disabled="passwordTooShort" data-workspace-export @click="exportNow">
          <Icon name="lucide:download" class="size-3.5" />{{ t('backup.workspace.export') }}
        </UiButton>
      </div>
    </div>

    <div class="mt-4 grid gap-2 border-t border-border pt-3">
      <input
        type="file"
        accept=".json,application/json"
        class="text-sm text-fg file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-sm file:text-fg"
        data-workspace-file
        @change="onFile"
      >
      <template v-if="pending">
        <p class="text-xs text-fg-muted">
          {{ t('backup.workspace.contents', { connections: pending.connections.length, queries: pending.savedQueries.length }) }}
        </p>
        <label v-if="pending.kdf" class="grid gap-1 text-xs text-fg-muted">
          {{ t('backup.workspace.passwordOfFile') }}
          <UiInput v-model="importPassword" type="password" autocomplete="off" data-workspace-import-password />
        </label>
        <p v-else class="text-xs text-warning">{{ t('backup.workspace.noSecrets') }}</p>
        <p class="text-xs text-fg-subtle">{{ t('backup.workspace.mergeHint') }}</p>
        <div class="flex justify-end">
          <UiButton size="sm" variant="primary" :loading="importing" :disabled="!!pending.kdf && !importPassword" data-workspace-import @click="importNow">
            <Icon name="lucide:upload" class="size-3.5" />{{ t('backup.workspace.import') }}
          </UiButton>
        </div>
      </template>
      <p v-if="result" class="text-xs text-success" data-workspace-result>
        {{ t('backup.workspace.result', { connections: result.connections, queries: result.savedQueries }) }}
        <span v-if="result.withoutSecrets" class="text-warning">{{ t('backup.workspace.resultNoSecrets', { count: result.withoutSecrets }) }}</span>
      </p>
      <p v-if="failure" class="text-xs text-danger" data-workspace-error>{{ failure }}</p>
    </div>
  </section>
</template>
