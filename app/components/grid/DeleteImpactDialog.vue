<script setup lang="ts">
import type { ReferentialAction } from '#shared/types/db'
import type { RecordKey, ResolveResponse } from '#shared/types/relations'
import { useSchemaStore } from '~/stores/schema'

/**
 * Asks before rows are marked for deletion and shows what that touches: the relations that point at
 * them, with the record counts and what the foreign key does (CASCADE removes them too, RESTRICT
 * blocks the delete). Nothing is deleted here; confirming only adds the rows to the pending changes.
 */
const props = defineProps<{
  connectionId: string
  schema: string
  table: string
  keys: RecordKey[]
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
const schemaStore = useSchemaStore()

interface Impact {
  name: string
  target: string
  count: number
  action: ReferentialAction | null
  virtual: boolean
}

const loading = ref(false)
const failed = ref(false)
const impacts = ref<Impact[]>([])

const refs = computed(() =>
  (schemaStore.graph?.tables[props.table]?.incoming ?? []).filter(
    (r) => r.cardinality === 'one-to-many' || r.cardinality === 'one-to-one',
  ),
)

async function load(): Promise<void> {
  impacts.value = []
  failed.value = false
  if (refs.value.length === 0 || props.keys.length === 0) return
  loading.value = true
  try {
    const res = await $fetch<ResolveResponse>(
      `/api/c/${props.connectionId}/tables/${encodeURIComponent(props.table)}/relations/resolve`,
      {
        method: 'POST',
        body: { schema: props.schema, rows: props.keys.slice(0, 500), relations: refs.value.map((r) => r.name) },
      },
    )
    impacts.value = refs.value
      .map((ref) => ({
        name: ref.name,
        target: ref.target,
        count: res.rows.reduce((sum, row) => sum + (row.counts[ref.name] ?? 0), 0),
        action: schemaStore.graph?.relations.find((r) => r.id === ref.relationId)?.onDelete ?? null,
        virtual: ref.virtual,
      }))
      .filter((i) => i.count > 0)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
watch(open, (isOpen) => isOpen && void load())

const blocking = computed(() => impacts.value.some((i) => i.action === 'restrict' || i.action === 'no action'))

const ACTION_KEY: Record<string, string> = {
  cascade: 'cascade',
  restrict: 'restrict',
  'no action': 'restrict',
  'set null': 'setNull',
  'set default': 'setDefault',
}
const actionKey = (a: ReferentialAction | null) => (a ? (ACTION_KEY[a] ?? 'none') : 'none')
const TONE: Record<string, string> = {
  cascade: 'text-warning',
  restrict: 'text-danger',
  setNull: 'text-fg-muted',
  setDefault: 'text-fg-muted',
  none: 'text-fg-subtle',
}
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="t('edit.deleteTitle', { count: keys.length })"
    :description="t('edit.deleteBody', { table })"
  >
    <UiSkeleton v-if="loading" class="h-10" />
    <p v-else-if="failed" class="text-xs text-warning">{{ t('edit.impactFailed') }}</p>
    <p v-else-if="impacts.length === 0" class="text-sm text-fg-muted" data-impact-none>{{ t('edit.impactNone') }}</p>
    <ul v-else class="grid gap-1" data-impact-list>
      <li
        v-for="impact in impacts"
        :key="impact.name"
        class="font-data flex min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
      >
        <span class="min-w-0 flex-1 truncate text-fg">{{ impact.name }}</span>
        <span class="tabular-nums text-fg-muted">{{ t('edit.impactCount', { count: impact.count }) }}</span>
        <span :class="TONE[actionKey(impact.action)]">{{ t(`edit.action.${actionKey(impact.action)}`) }}</span>
      </li>
    </ul>
    <p v-if="blocking" class="mt-2 text-xs text-danger" role="alert">{{ t('edit.impactBlocks') }}</p>
    <template #footer>
      <UiButton size="sm" variant="secondary" @click="open = false">{{ t('common.cancel') }}</UiButton>
      <UiButton size="sm" variant="danger" data-confirm-delete @click="(open = false), emit('confirm')">{{ t('edit.markDelete') }}</UiButton>
    </template>
  </UiDialog>
</template>
