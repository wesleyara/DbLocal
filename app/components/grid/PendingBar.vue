<script setup lang="ts">
import type { MutationErrorItem, MutationResponse, MutationStatement } from '#shared/types/mutations'
import { tokenizeSql } from '#shared/sql-tokens'
import { useConnectionErrors } from '~/composables/useConnectionErrors'
import { useToast } from '~/composables/useToast'
import { usePendingStore } from '~/stores/pending-changes'
import { useUiStore } from '~/stores/ui'

/**
 * "N pending changes · Discard · Preview SQL · Save". Saving sends the whole batch of the tab in
 * one transaction. When it deletes rows (any connection, unless the "double check" setting is off)
 * or writes to `prod`, a dialog says so and the connection's name has to be typed first. A failed save keeps every pending change and marks
 * the row that caused it.
 */
const props = defineProps<{
  connectionId: string
  schema: string
  tabId: string
  connectionName: string
  environment: 'local' | 'staging' | 'prod'
}>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()
const toast = useToast()
const pending = usePendingStore()
const errors = useConnectionErrors()

const count = computed(() => pending.count(props.tabId))
const saving = ref(false)

const previewOpen = ref(false)
const previewLoading = ref(false)
const statements = ref<MutationStatement[]>([])
const previewError = ref<string | null>(null)

const confirmDiscard = ref(false)
const confirmProd = ref(false)
const typedName = ref('')
const nameMatches = computed(() => typedName.value.trim() === props.connectionName)
/** Rows the save deletes: shown in the confirmation, which they make mandatory. */
const deletes = ref(0)

function bodyOf(dryRun: boolean) {
  const { ops, targets } = pending.batch(props.tabId)
  return { targets, body: { schema: props.schema, ops, dryRun } }
}

/** Reads the per-operation errors of a failed batch from the API error body. */
function itemsOf(err: unknown): MutationErrorItem[] {
  const list = (err as { data?: { data?: { errors?: MutationErrorItem[] } } })?.data?.data?.errors
  return Array.isArray(list) ? list : []
}

async function openPreview(): Promise<void> {
  previewOpen.value = true
  previewLoading.value = true
  previewError.value = null
  statements.value = []
  const { targets, body } = bodyOf(true)
  try {
    const res = await $fetch<MutationResponse>(`/api/c/${props.connectionId}/mutations`, { method: 'POST', body })
    statements.value = res.statements
  } catch (err) {
    const first = itemsOf(err)[0]
    previewError.value = first ? first.message : errors.message(err)
    if (first && targets[first.index]) pending.fail(props.tabId, targets[first.index]!, first.message)
  } finally {
    previewLoading.value = false
  }
}

function requestSave(): void {
  if (count.value === 0 || saving.value) return
  deletes.value = pending.batch(props.tabId).ops.filter((op) => op.type === 'delete').length
  if (props.environment === 'prod' || (deletes.value > 0 && useUiStore().doubleCheck)) {
    typedName.value = ''
    confirmProd.value = true
  } else void save()
}

async function save(): Promise<void> {
  confirmProd.value = false
  if (count.value === 0 || saving.value) return
  saving.value = true
  pending.clearErrors(props.tabId)
  const { targets, body } = bodyOf(false)
  try {
    const res = await $fetch<MutationResponse>(`/api/c/${props.connectionId}/mutations`, { method: 'POST', body })
    const by = (type: string) => res.results.filter((r) => r.type === type).length
    pending.saved(props.tabId)
    toast.push({
      kind: 'success',
      title: t('edit.saved', { count: res.results.length }),
      description: t('edit.savedDetail', { inserted: by('insert'), updated: by('update'), deleted: by('delete') }),
    })
    emit('saved')
  } catch (err) {
    const items = itemsOf(err)
    for (const item of items) {
      const target = targets[item.index]
      if (target) pending.fail(props.tabId, target, item.message)
    }
    toast.push({
      kind: 'error',
      title: t('edit.saveFailed'),
      description: items[0]?.message ?? errors.message(err),
      duration: 8000,
    })
  } finally {
    saving.value = false
  }
}

function discard(): void {
  confirmDiscard.value = false
  pending.discard(props.tabId)
}

// ⌘S / Ctrl+S saves, from anywhere on the page while there is something to save.
function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's' && count.value > 0) {
    event.preventDefault()
    requestSave()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const previewText = computed(() => statements.value.map((s) => `${s.preview};`).join('\n\n'))
const tokens = computed(() => tokenizeSql(previewText.value))
const KIND_CLASS = {
  keyword: 'text-accent',
  string: 'text-type-string',
  number: 'text-type-number',
  identifier: 'text-fg',
  text: 'text-fg-muted',
} as const

function copyPreview(): void {
  void navigator.clipboard?.writeText(previewText.value)
}
</script>

<template>
  <div
    v-if="count > 0"
    class="absolute inset-x-0 bottom-10 z-30 mx-auto flex w-fit max-w-[95%] items-center gap-2 rounded-lg border border-warning/60 bg-surface px-3 py-1.5 shadow-pop"
    role="region"
    :aria-label="t('edit.pending', { count })"
    data-pending-bar
  >
    <span class="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
    <span class="text-sm text-fg" data-pending-count>{{ t('edit.pending', { count }) }}</span>
    <HelpHint :id="environment === 'prod' ? 'grid.prod' : 'grid.pending'" />
    <UiButton size="sm" variant="ghost" :disabled="saving" data-discard @click="confirmDiscard = true">{{ t('edit.discard') }}</UiButton>
    <UiButton size="sm" variant="secondary" :disabled="saving" data-preview-sql @click="openPreview">{{ t('edit.previewSql') }}</UiButton>
    <UiButton size="sm" variant="primary" :loading="saving" data-save @click="requestSave">
      {{ t('edit.save', { count }) }}
    </UiButton>
  </div>

  <UiDialog v-model:open="previewOpen" :title="t('edit.previewTitle')" :description="t('edit.previewHint')">
    <UiSkeleton v-if="previewLoading" class="h-16" />
    <p v-else-if="previewError" class="text-sm text-danger" role="alert">{{ previewError }}</p>
    <pre
      v-else
      class="font-data max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg-subtle p-2 text-xs"
      data-sql-preview
    ><template v-for="(tok, i) in tokens" :key="i"><span :class="KIND_CLASS[tok.kind]">{{ tok.text }}</span></template></pre>
    <template #footer>
      <UiButton v-if="statements.length" size="sm" variant="secondary" @click="copyPreview">{{ t('grid.copy') }}</UiButton>
      <UiButton size="sm" variant="secondary" @click="previewOpen = false">{{ t('common.close') }}</UiButton>
    </template>
  </UiDialog>

  <UiDialog v-model:open="confirmDiscard" :title="t('edit.discardTitle')" :description="t('edit.discardBody', { count })">
    <template #footer>
      <UiButton size="sm" variant="secondary" @click="confirmDiscard = false">{{ t('common.cancel') }}</UiButton>
      <UiButton size="sm" variant="danger" data-confirm-discard @click="discard">{{ t('edit.discard') }}</UiButton>
    </template>
  </UiDialog>

  <UiDialog
    v-model:open="confirmProd"
    :title="environment === 'prod' ? t('edit.prodTitle') : t('edit.deleteTitle')"
    :description="environment === 'prod' ? t('edit.prodBody', { count, name: connectionName }) : t('edit.deleteBody', { name: connectionName })"
  >
    <p v-if="deletes > 0" class="mb-3 flex items-center gap-2 rounded-md border border-danger/50 bg-danger-soft p-2 text-xs text-danger" role="alert" data-save-deletes>
      <Icon name="lucide:triangle-alert" class="size-4 shrink-0" />{{ t('edit.deleteWarning', { count: deletes }, deletes) }}
    </p>
    <UiInput v-model="typedName" mono :placeholder="connectionName" :aria-label="t('edit.prodType', { name: connectionName })" data-autofocus data-prod-confirm @keydown.enter="nameMatches && save()" />
    <template #footer>
      <UiButton size="sm" variant="secondary" @click="confirmProd = false">{{ t('common.cancel') }}</UiButton>
      <UiButton size="sm" variant="danger" :disabled="!nameMatches" data-prod-save @click="save">{{ t('edit.save', { count }) }}</UiButton>
    </template>
  </UiDialog>
</template>
