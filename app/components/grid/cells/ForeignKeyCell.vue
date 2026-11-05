<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import type { RelationRef } from '#shared/types/db'
import type { RecordKey, RecordResponse, RecordSummary } from '#shared/types/relations'
import { keyLabel } from '#shared/nav-url'

const props = defineProps<{
  connectionId: string
  schema: string
  /** Table the FK points to. */
  target: string
  /** The raw FK value shown when nothing better is known (composite keys: the first part). */
  value: unknown
  /** `undefined` while it loads, `null` when the parent does not exist. */
  parent: RecordSummary | null | undefined
  virtual?: boolean
  /**
   * Key of the target record built from the raw FK value (single-column FKs). Used while the parent
   * is not resolved yet, or after the value was edited, so a click still opens the record.
   */
  fallbackKey?: RecordKey | null
  /** The relation the chip follows: shown in the hover card (columns, cardinality, virtual). */
  relation?: RelationRef | null
}>()
const emit = defineEmits<{ open: [key: RecordKey, newTab: boolean] }>()
const { t } = useI18n()

/** The key without the `#` prefix `keyLabel` adds. */
const plainKey = (key: RecordKey): string => keyLabel(key).slice(1)

const isNull = computed(() => props.value === null || props.value === undefined)
const orphan = computed(() => !isNull.value && props.parent === null)
const text = computed(() => {
  if (props.parent) return `${plainKey(props.parent.key)}${props.parent.label ? ` · ${props.parent.label}` : ''}`
  return String(props.value)
})

function onClick(event: MouseEvent): void {
  event.stopPropagation()
  const key = props.parent?.key ?? (props.parent === null ? null : props.fallbackKey)
  if (key) emit('open', key, event.metaKey || event.ctrlKey)
}

// Hover preview: the parent is read in full only when the card opens, and only once.
const open = ref(false)
const preview = shallowRef<RecordResponse | null>(null)
const failed = ref(false)
watch(open, async (isOpen) => {
  if (!isOpen || preview.value || !props.parent) return
  try {
    preview.value = await $fetch<RecordResponse>(
      `/api/c/${props.connectionId}/tables/${encodeURIComponent(props.target)}/record`,
      { query: { schema: props.schema, pk: JSON.stringify(props.parent.key) } },
    )
  } catch {
    failed.value = true
  }
})
/** Every column of the parent, NULLs and JSON included. */
const fields = computed(() => (preview.value ? Object.entries(preview.value.row) : []))
/** The parent's own relations: what it belongs to and how many records point at it. */
const parentLinks = computed(() => {
  if (!preview.value) return [] as { name: string; text: string }[]
  const { parents, counts } = preview.value.relations
  return [
    ...Object.entries(parents).map(([name, p]) => ({
      name,
      text: p ? `${plainKey(p.key)}${p.label ? ` · ${p.label}` : ''}` : t('record.noParent'),
    })),
    ...Object.entries(counts).map(([name, n]) => ({ name, text: t('relations.cardRecords', { count: n }, n) })),
  ]
})

function display(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('$binary' in (v as object) && typeof (v as { size?: unknown }).size === 'number') {
      return t('grid.binaryBytes', { size: (v as { size: number }).size })
    }
    return JSON.stringify(v)
  }
  return String(v)
}

const CARDINALITY: Record<string, string> = { 'many-to-one': 'N:1', 'one-to-one': '1:1', 'one-to-many': '1:N', 'many-to-many': 'N:N' }
const relationLine = computed(() => {
  const r = props.relation
  if (!r) return null
  const to = r.targetColumns.length ? r.targetColumns : props.parent ? Object.keys(props.parent.key) : []
  return {
    name: r.name,
    from: r.columns.join(', '),
    to: `${r.target}.${to.length > 1 ? `(${to.join(', ')})` : (to[0] ?? '')}`,
    cardinality: CARDINALITY[r.cardinality] ?? r.cardinality,
  }
})
</script>

<template>
  <span v-if="isNull" class="rounded-sm border border-border px-1 text-[10px] uppercase tracking-wide text-type-null italic">{{ t('grid.null') }}</span>
  <HoverCardRoot v-else v-model:open="open" :open-delay="350" :close-delay="80">
    <HoverCardTrigger as-child>
      <button
        type="button"
        class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border px-1.5 leading-5 transition-colors"
        :class="[
          orphan
            ? 'border-warning/60 bg-warning-soft text-warning'
            : 'border-accent/40 bg-accent/20 text-fg hover:border-accent/70 hover:bg-accent/35',
          virtual && !orphan && 'border-dashed',
        ]"
        :data-fk-chip="target"
        data-tour="fk-chip"
        :title="orphan ? t('relations.orphan', { target }) : undefined"
        @click="onClick"
        @mousedown.stop
        @dblclick.stop
      >
        <Icon v-if="orphan" name="lucide:triangle-alert" class="size-3 shrink-0" />
        <span class="truncate" :class="parent === undefined && 'text-fg-subtle'">{{ text }}</span>
      </button>
    </HoverCardTrigger>
    <HoverCardPortal v-if="parent">
      <HoverCardContent
        :side-offset="6"
        class="font-data z-50 w-96 max-w-[90vw] overflow-hidden rounded-lg border border-border-strong bg-surface text-xs shadow-pop"
      >
        <header class="border-b border-border bg-accent/10 px-3 py-2">
          <div class="flex items-center gap-2">
            <Icon name="lucide:table-2" class="size-3.5 shrink-0 text-accent" />
            <span class="font-medium text-fg">{{ target }}</span>
            <span class="ml-auto min-w-0 break-all rounded-sm bg-accent/20 px-1.5 py-0.5 text-accent">{{ plainKey(parent.key) }}</span>
          </div>
          <p v-if="parent.label" class="mt-1 truncate text-fg-muted">{{ parent.label }}</p>
          <p v-if="relationLine" class="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-fg-subtle" data-fk-relation>
            <span class="text-fg-muted">{{ relationLine.name }}</span>
            <span>·</span>
            <span>{{ relationLine.from }}</span>
            <Icon name="lucide:arrow-right" class="size-3" />
            <span>{{ relationLine.to }}</span>
            <span class="rounded-sm border border-border px-1">{{ relationLine.cardinality }}</span>
            <span v-if="relation?.virtual" class="rounded-sm border border-dashed border-accent/60 px-1 text-accent">{{ t('record.virtual') }}</span>
          </p>
        </header>
        <div class="max-h-96 overflow-auto">
          <p v-if="failed" class="px-3 py-2 text-danger">{{ t('relations.previewFailed') }}</p>
          <UiSkeleton v-else-if="!preview" class="m-3 h-12" />
          <template v-else>
            <table class="w-full table-fixed border-collapse" data-fk-fields>
              <tbody>
                <tr v-for="[name, v] in fields" :key="name" class="border-b border-border last:border-b-0">
                  <th class="w-2/5 border-r border-border px-3 py-1.5 text-left align-top font-normal text-fg-subtle [overflow-wrap:anywhere]">{{ name }}</th>
                  <td class="px-3 py-1.5 align-top text-fg [overflow-wrap:anywhere]">
                    <span v-if="v === null || v === undefined" class="text-[10px] uppercase tracking-wide text-type-null italic">{{ t('grid.null') }}</span>
                    <span v-else class="line-clamp-6 whitespace-pre-wrap">{{ display(v) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <section v-if="parentLinks.length" class="border-t border-border" data-fk-links>
              <h4 class="px-3 pt-2 text-[10px] uppercase tracking-wide text-fg-subtle">{{ t('relations.cardRelations') }}</h4>
              <ul class="px-3 pb-2">
                <li v-for="link in parentLinks" :key="link.name" class="flex gap-2 py-0.5">
                  <span class="w-2/5 shrink-0 truncate text-fg-subtle">{{ link.name }}</span>
                  <span class="min-w-0 truncate text-fg">{{ link.text }}</span>
                </li>
              </ul>
            </section>
          </template>
        </div>
        <footer class="border-t border-border bg-bg px-3 py-1.5 text-[10px] text-fg-subtle">{{ t('relations.chipHint') }}</footer>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
