<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import type { RecordKey, RecordSummary } from '#shared/types/relations'
import type { RowsResponse } from '#shared/types/rows'
import { keyLabel } from '#shared/nav-url'

const props = defineProps<{
  /** `undefined` while it loads. */
  count: number | undefined
  /** Name shown next to the number, e.g. `orders`. */
  noun: string
  virtual?: boolean
  /** Inverse 1:1: the single related record. The chip then shows its key and label instead of the count. */
  related?: RecordSummary | null
  /** Set for the inverse side of a 1:1: hovering shows the single related record, like an FK chip. */
  preview?: { connectionId: string; schema: string; table: string; relation: string; key: RecordKey; target: string }
}>()
const { t } = useI18n()
const emit = defineEmits<{ open: [newTab: boolean] }>()
const { number } = useFormat()
const badge = computed(() => number(props.count ?? 0))
const text = computed(() => props.noun)
/** Inverse 1:1 record, written like an FK chip: `1 · Engenheira de dados`. */
const recordText = computed(() => {
  if (!props.related) return null
  const key = keyLabel(props.related.key).slice(1)
  return props.related.label ? `${key} · ${props.related.label}` : key
})

function onClick(event: MouseEvent): void {
  event.stopPropagation()
  emit('open', event.metaKey || event.ctrlKey)
}

const open = ref(false)
const record = shallowRef<Record<string, unknown> | null>(null)
const failed = ref(false)
watch(open, async (isOpen) => {
  if (!isOpen || record.value || !props.preview) return
  const p = props.preview
  try {
    const res = await $fetch<RowsResponse>(`/api/c/${p.connectionId}/tables/${encodeURIComponent(p.target)}/rows`, {
      method: 'POST',
      body: { schema: p.schema, filter: null, sort: [], limit: 1, offset: 0, scope: { table: p.table, relation: p.relation, key: p.key } },
    })
    record.value = res.rows[0] ?? null
    failed.value = record.value === null
  } catch {
    failed.value = true
  }
})
const fields = computed(() =>
  record.value ? Object.entries(record.value).filter(([, v]) => v !== null && typeof v !== 'object').slice(0, 12) : [],
)
/** Inverse 1:1 with no related record: drawn like the record chip, muted, instead of `0 table`. */
const emptyRecord = computed(() => !!props.preview && props.count === 0)
const hasPreview = computed(() => !!props.preview && props.count !== undefined && props.count > 0)
</script>

<template>
  <UiSkeleton v-if="props.count === undefined" class="h-3 w-16" />
  <HoverCardRoot v-else-if="hasPreview" v-model:open="open" :open-delay="350" :close-delay="80">
    <HoverCardTrigger as-child>
      <button
        type="button"
        class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-accent/40 bg-accent/20 px-1.5 leading-5 text-fg transition-colors hover:border-accent/70 hover:bg-accent/35"
        :class="props.virtual && 'border-dashed'"
        :data-relation-count="noun"
        data-tour="relation-count"
        @click="onClick"
        @mousedown.stop
        @dblclick.stop
      >
        <template v-if="recordText">
          <span class="truncate">{{ recordText }}</span>
        </template>
        <template v-else>
          <span class="shrink-0 rounded-[3px] bg-accent/35 px-1.5 font-semibold tabular-nums">{{ badge }}</span>
          <span class="truncate">{{ text }}</span>
        </template>
      </button>
    </HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent
        :side-offset="6"
        class="font-data z-50 w-96 max-w-[90vw] overflow-hidden rounded-lg border border-border-strong bg-surface text-xs shadow-pop"
      >
        <header class="flex items-center gap-2 border-b border-border bg-accent/10 px-3 py-2">
          <Icon name="lucide:table-2" class="size-3.5 shrink-0 text-accent" />
          <span class="font-medium text-fg">{{ props.preview!.target }}</span>
        </header>
        <div class="max-h-80 overflow-auto">
          <p v-if="failed" class="px-3 py-2 text-danger">{{ t('relations.previewFailed') }}</p>
          <UiSkeleton v-else-if="!record" class="m-3 h-12" />
          <table v-else class="w-full table-fixed border-collapse">
            <tbody>
              <tr v-for="[name, v] in fields" :key="name" class="border-b border-border last:border-b-0">
                <th class="w-2/5 border-r border-border px-3 py-1.5 text-left align-top font-normal text-fg-subtle [overflow-wrap:anywhere]">{{ name }}</th>
                <td class="px-3 py-1.5 align-top whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{{ v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="border-t border-border bg-bg px-3 py-1.5 text-[10px] text-fg-subtle">{{ t('relations.chipHint') }}</footer>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
  <button
    v-else
    type="button"
    class="font-data inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border py-px text-xs transition-colors"
    :class="[
      emptyRecord ? 'gap-1 px-1.5 leading-5' : 'pr-1.5 pl-px',
      props.count === 0
        ? 'border-border bg-surface text-fg-subtle hover:border-border-strong hover:bg-surface-hover'
        : 'border-accent/40 bg-accent/15 text-fg hover:border-accent/70 hover:bg-accent/25',
      props.virtual && 'border-dashed',
    ]"
    :data-relation-count="noun"
    data-tour="relation-count"
    @click="onClick"
    @mousedown.stop
    @dblclick.stop
  >
    <template v-if="emptyRecord">
      <span class="truncate">{{ t('relations.noRecord') }}</span>
    </template>
    <template v-else>
      <span
        class="shrink-0 rounded-[3px] px-1.5 font-semibold tabular-nums"
        :class="props.count === 0 ? 'bg-border text-fg-subtle' : 'bg-accent/35 text-fg'"
      >{{ badge }}</span>
      <span class="truncate">{{ text }}</span>
    </template>
  </button>
</template>
