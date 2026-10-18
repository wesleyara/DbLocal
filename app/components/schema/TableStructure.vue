<script setup lang="ts">
import type { Cardinality, RelationRef, SchemaTable } from '#shared/types/db'
import type { DbTrigger } from '#shared/types/routines'

const props = defineProps<{ table: SchemaTable; outgoing: RelationRef[]; incoming: RelationRef[]; triggers?: DbTrigger[] }>()
const emit = defineEmits<{ openTrigger: [trigger: DbTrigger] }>()
const { t } = useI18n()

const CARDINALITY_KEY = {
  'many-to-one': 'manyToOne',
  'one-to-many': 'oneToMany',
  'one-to-one': 'oneToOne',
  'many-to-many': 'manyToMany',
} as const
const cardinality = (c: Cardinality) => t(`virtualRelations.cardinalityOptions.${CARDINALITY_KEY[c]}`)

/** Unique indexes of the table that are not its primary key. */
const uniques = computed(() => props.table.indexes.filter((i) => i.unique && !i.primary))
const uniqueSingle = computed(() => new Set(uniques.value.filter((i) => i.columns.length === 1).map((i) => i.columns[0]!)))
/** Composite unique indexes a column takes part in, for the tooltip. */
const compositeOf = (column: string) =>
  uniques.value.filter((i) => i.columns.length > 1 && i.columns.includes(column)).map((i) => i.columns.join(', '))

/** `table.column` a column's foreign key points at. */
const referenceOf = (column: string): string | null => {
  const fk = props.table.foreignKeys.find((f) => f.columns.includes(column))
  if (!fk) return null
  const at = fk.columns.indexOf(column)
  const target = fk.refColumns[at]
  return target ? `${fk.refTable}.${target}` : fk.refTable
}

const hasRelations = computed(() => props.outgoing.length + props.incoming.length > 0)
</script>

<template>
  <div class="grid gap-4" data-table-structure>
    <div>
      <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('tableView.columns') }}</h3>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-left text-sm">
          <thead class="bg-bg-subtle text-xs text-fg-muted">
            <tr>
              <th class="px-2 py-1 font-medium">{{ t('common.name') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('tableView.type') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('schemaTree.nullable') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('tableView.unique') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('tableView.default') }}</th>
              <th class="px-2 py-1 font-medium">{{ t('tableView.references') }}</th>
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
              <td class="px-2 py-1">
                <UiBadge v-if="uniqueSingle.has(col.name)" tone="accent">{{ t('tableView.unique') }}</UiBadge>
                <span
                  v-else-if="compositeOf(col.name).length"
                  class="font-data text-xs text-fg-muted"
                  :title="t('tableView.compositeUnique')"
                >({{ compositeOf(col.name).join(' · ') }})</span>
                <span v-else class="text-fg-subtle">—</span>
              </td>
              <td class="px-2 py-1">
                <span v-if="col.default !== null" class="font-data text-xs text-fg-muted" :title="col.default">{{ col.default }}</span>
                <UiBadge v-else-if="col.isGenerated" tone="neutral">{{ t('tableView.generated') }}</UiBadge>
                <span v-else class="text-fg-subtle">—</span>
              </td>
              <td class="font-data px-2 py-1 text-xs text-fg-muted">
                <span v-if="referenceOf(col.name)">→ {{ referenceOf(col.name) }}</span>
                <span v-else class="text-fg-subtle">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('tableView.relations') }}</h3>
      <p v-if="!hasRelations" class="text-sm text-fg-muted">{{ t('schemaTree.noRelations') }}</p>
      <div v-else class="grid gap-3 sm:grid-cols-2">
        <div v-for="side in [{ key: 'outgoing', refs: outgoing, icon: 'lucide:arrow-right' }, { key: 'incoming', refs: incoming, icon: 'lucide:arrow-left' }]" :key="side.key">
          <p class="mb-1 text-xs text-fg-muted">{{ t(`tableView.${side.key}`) }}</p>
          <ul class="grid gap-1">
            <li
              v-for="ref in side.refs"
              :key="`${ref.relationId}:${ref.name}`"
              class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
              :class="ref.virtual && 'border-dashed border-accent/50'"
              :title="cardinality(ref.cardinality)"
            >
              <Icon :name="ref.virtual ? 'lucide:link-2' : side.icon" class="size-3.5 shrink-0 text-fg-subtle" />
              <span class="font-data min-w-0 flex-1 truncate text-fg">{{ ref.name }}</span>
              <span class="font-data truncate text-xs text-fg-subtle">{{ ref.target }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-if="triggers?.length" data-table-triggers>
      <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('tableView.triggers') }}</h3>
      <ul class="grid gap-1">
        <li v-for="tr in triggers" :key="tr.name">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1 text-left text-sm hover:bg-surface"
            :data-trigger="tr.name"
            @click="emit('openTrigger', tr)"
          >
            <Icon name="lucide:zap" class="size-3.5 shrink-0 text-fg-subtle" />
            <span class="font-data min-w-0 flex-1 truncate text-fg">{{ tr.name }}</span>
            <UiBadge tone="accent">{{ tr.timing }} {{ tr.events.join(' / ') }}</UiBadge>
            <UiBadge v-if="!tr.enabled" tone="warning">{{ t('routines.disabled') }}</UiBadge>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
