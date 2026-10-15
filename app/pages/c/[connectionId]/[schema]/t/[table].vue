<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import { useSchemaStore } from '~/stores/schema'
import TableGrid from '~/components/grid/TableGrid.vue'
import RecordPanel from '~/components/record/RecordPanel.vue'
import { decodeRecord } from '#shared/nav-url'

const route = useRoute()
const id = route.params.connectionId as string
const schemaName = route.params.schema as string
const { t } = useI18n()
const { number } = useFormat()
const store = useSchemaStore()

const { data: view } = await useFetch<ConnectionView>(`/api/connections/${id}`, {
  key: `connection-${id}`,
})
await store.ensure(id, schemaName)

const envClass: Record<ConnectionView['environment'], string> = {
  local: 'bg-env-local',
  staging: 'bg-env-staging',
  prod: 'bg-env-prod',
}
const envText: Record<ConnectionView['environment'], string> = {
  local: 'text-env-local',
  staging: 'text-env-staging',
  prod: 'text-env-prod',
}

/** The table shown in the main area comes from the path (`/t/:table`), so the view is reproducible by URL. */
const tableName = computed(() => route.params.table as string)
const table = computed(() => store.tables.find((tb) => tb.name === tableName.value) ?? null)
const node = computed(() => (tableName.value ? store.graph?.tables[tableName.value] : undefined))

/** The record open in the side panel, from `?r=`. It may belong to another table than the page's. */
const openRecord = computed(() => decodeRecord(typeof route.query.r === 'string' ? route.query.r : null, tableName.value))
const recordTableKnown = computed(() => !!openRecord.value && store.tables.some((tb) => tb.name === openRecord.value!.table))

const CARDINALITY_KEY = {
  'many-to-one': 'manyToOne',
  'one-to-many': 'oneToMany',
  'one-to-one': 'oneToOne',
  'many-to-many': 'manyToMany',
} as const
const cardinality = (c: keyof typeof CARDINALITY_KEY) => t(`virtualRelations.cardinalityOptions.${CARDINALITY_KEY[c]}`)
</script>

<template>
  <div class="flex h-full min-h-0">
  <div class="flex min-h-full min-w-0 flex-1 flex-col overflow-auto">
    <!-- Environment strip: red across the top in prod, so the user always knows where they are. -->
    <div v-if="view" class="h-0.5 shrink-0" :class="envClass[view.environment]" aria-hidden="true" />
    <header v-if="view" class="flex items-center gap-2 border-b border-border px-3 py-1.5">
      <h1 class="truncate text-sm font-semibold text-fg">{{ view.name }}</h1>
      <span class="font-data text-xs font-medium uppercase" :class="envText[view.environment]">
        {{ view.environment }}
      </span>
      <UiBadge v-if="view.readonly || view.readonlyGlobal" tone="warning">{{ t('shell.status.readonly') }}</UiBadge>
      <span class="font-data ml-auto truncate text-xs text-fg-muted">{{ route.params.schema }}</span>
    </header>

    <UiEmptyState
      v-if="!tableName"
      icon="lucide:table-2"
      :title="t('shell.noTable')"
      :description="t('shell.noTableHint')"
    />
    <UiEmptyState v-else-if="!table" icon="lucide:triangle-alert" :title="t('tableView.notFound')" />

    <section v-else class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-4">
      <div class="flex flex-wrap items-baseline gap-3">
        <h2 class="font-data text-base font-semibold text-fg">{{ table.name }}</h2>
        <span class="text-xs text-fg-subtle">{{ table.kind === 'table' ? t('schemaTree.tables') : t('tableView.view') }}</span>
        <span v-if="table.rowEstimate !== null" class="font-data text-xs text-fg-subtle">
          {{ t('schemaTree.rowsEstimate', { count: number(table.rowEstimate, { notation: 'compact', maximumFractionDigits: 1 }) }) }}
        </span>
        <span v-if="node?.displayColumn" class="text-xs text-fg-subtle">
          {{ t('schemaTree.displayColumn') }}: <span class="font-data text-fg-muted">{{ node.displayColumn }}</span>
        </span>
      </div>

      <div class="h-[60vh] min-h-72 min-w-0">
        <TableGrid :key="table.name" :connection-id="id" :schema="schemaName" :table="table" :connection="view" />
      </div>

      <div>
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('tableView.columns') }}</h3>
        <div class="overflow-x-auto rounded-md border border-border">
          <table class="w-full text-left text-sm">
            <thead class="bg-bg-subtle text-xs text-fg-muted">
              <tr>
                <th class="px-2 py-1 font-medium">{{ t('common.name') }}</th>
                <th class="px-2 py-1 font-medium">{{ t('schemaTree.columns') }}</th>
                <th class="px-2 py-1 font-medium">{{ t('schemaTree.nullable') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="col in table.columns" :key="col.name" class="border-t border-border">
                <td class="font-data px-2 py-1 text-fg">
                  <Icon v-if="col.isPrimaryKey" name="lucide:key-round" class="mr-1 inline size-3 text-warning" :aria-label="t('schemaTree.primaryKey')" />
                  {{ col.name }}
                </td>
                <td class="font-data px-2 py-1 text-fg-muted">{{ col.nativeType }}</td>
                <td class="px-2 py-1 text-fg-subtle">{{ col.nullable ? t('common.yes') : t('common.no') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="node">
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('tableView.relations') }}</h3>
        <p v-if="node.outgoing.length + node.incoming.length === 0" class="text-sm text-fg-muted">{{ t('schemaTree.noRelations') }}</p>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <div>
            <p class="mb-1 text-xs text-fg-muted">{{ t('tableView.outgoing') }}</p>
            <ul class="grid gap-1">
              <li
                v-for="ref in node.outgoing"
                :key="`${ref.relationId}:${ref.name}`"
                class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
                :class="ref.virtual && 'border-dashed border-accent/50'"
                :title="cardinality(ref.cardinality)"
              >
                <Icon :name="ref.virtual ? 'lucide:link-2' : 'lucide:arrow-right'" class="size-3.5 shrink-0 text-fg-subtle" />
                <span class="font-data min-w-0 flex-1 truncate text-fg">{{ ref.name }}</span>
                <span class="font-data truncate text-xs text-fg-subtle">{{ ref.target }}</span>
              </li>
            </ul>
          </div>
          <div>
            <p class="mb-1 text-xs text-fg-muted">{{ t('tableView.incoming') }}</p>
            <ul class="grid gap-1">
              <li
                v-for="ref in node.incoming"
                :key="`${ref.relationId}:${ref.name}`"
                class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
                :class="ref.virtual && 'border-dashed border-accent/50'"
                :title="cardinality(ref.cardinality)"
              >
                <Icon :name="ref.virtual ? 'lucide:link-2' : 'lucide:arrow-left'" class="size-3.5 shrink-0 text-fg-subtle" />
                <span class="font-data min-w-0 flex-1 truncate text-fg">{{ ref.name }}</span>
                <span class="font-data truncate text-xs text-fg-subtle">{{ ref.target }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
  <RecordPanel
    v-if="openRecord && recordTableKnown"
    :key="`${openRecord.table}:${JSON.stringify(openRecord.key)}`"
    :connection-id="id"
    :schema="schemaName"
    :table="openRecord.table"
    :record-key="openRecord.key"
    :connection="view"
  />
  </div>
</template>
