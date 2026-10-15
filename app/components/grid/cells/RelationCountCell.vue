<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import type { RecordKey } from '#shared/types/relations'
import type { RowsResponse } from '#shared/types/rows'

const props = defineProps<{
  /** `undefined` while it loads. */
  count: number | undefined
  /** Name shown next to the number, e.g. `orders`. */
  noun: string
  virtual?: boolean
  /** Set for the inverse side of a 1:1: hovering shows the single related record, like an FK chip. */
  preview?: { connectionId: string; schema: string; table: string; relation: string; key: RecordKey; target: string }
}>()
const { t } = useI18n()
const emit = defineEmits<{ open: [newTab: boolean] }>()
const { number } = useFormat()

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
const hasPreview = computed(() => !!props.preview && props.count !== undefined && props.count > 0)
</script>

<template>
  <UiSkeleton v-if="props.count === undefined" class="h-3 w-16" />
  <HoverCardRoot v-else-if="hasPreview" v-model:open="open" :open-delay="350" :close-delay="80">
    <HoverCardTrigger as-child>
      <button
        type="button"
        class="font-data inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/15 py-px pr-1.5 pl-px text-xs text-fg transition-colors hover:border-accent/70 hover:bg-accent/25"
        :class="props.virtual && 'border-dashed'"
        :data-relation-count="noun"
        data-tour="relation-count"
        @click="onClick"
        @mousedown.stop
        @dblclick.stop
      >
        <span class="shrink-0 rounded-[3px] bg-accent/35 px-1.5 font-semibold tabular-nums">{{ number(props.count) }}</span>
        <span class="truncate">{{ noun }}</span>
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
        <div class="max-h-80 overflow-auto px-3 py-2">
          <p v-if="failed" class="text-danger">{{ t('relations.previewFailed') }}</p>
          <UiSkeleton v-else-if="!record" class="h-12" />
          <dl v-else class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <template v-for="[name, v] in fields" :key="name">
              <dt class="text-fg-subtle">{{ name }}</dt>
              <dd class="min-w-0 whitespace-pre-wrap break-words text-fg">{{ v }}</dd>
            </template>
          </dl>
        </div>
        <footer class="border-t border-border bg-bg px-3 py-1.5 text-[10px] text-fg-subtle">{{ t('relations.chipHint') }}</footer>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
  <button
    v-else
    type="button"
    class="font-data inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border py-px pr-1.5 pl-px text-xs transition-colors"
    :class="[
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
    <span
      class="shrink-0 rounded-[3px] px-1.5 font-semibold tabular-nums"
      :class="props.count === 0 ? 'bg-border text-fg-subtle' : 'bg-accent/35 text-fg'"
    >{{ number(props.count) }}</span>
    <span class="truncate">{{ noun }}</span>
  </button>
</template>
