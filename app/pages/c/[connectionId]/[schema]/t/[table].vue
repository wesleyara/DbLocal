<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import { useSchemaStore } from '~/stores/schema'
import { useUiStore } from '~/stores/ui'
import TableStructure from '~/components/schema/TableStructure.vue'
import TableGrid from '~/components/grid/TableGrid.vue'
import RecordPanel from '~/components/record/RecordPanel.vue'
import { decodeRecord } from '#shared/nav-url'

const route = useRoute()
const id = route.params.connectionId as string
const schemaName = route.params.schema as string
const { t } = useI18n()
const { number } = useFormat()
const store = useSchemaStore()
const ui = useUiStore()

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

      <TableStructure
        v-if="ui.tableStructure"
        :table="table"
        :outgoing="node?.outgoing ?? []"
        :incoming="node?.incoming ?? []"
      />
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
