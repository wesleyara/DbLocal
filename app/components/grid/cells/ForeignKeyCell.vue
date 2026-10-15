<script setup lang="ts">
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
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
}>()
const emit = defineEmits<{ open: [key: RecordKey, newTab: boolean] }>()
const { t } = useI18n()

const isNull = computed(() => props.value === null || props.value === undefined)
const orphan = computed(() => !isNull.value && props.parent === null)
const text = computed(() => {
  if (props.parent) return `${keyLabel(props.parent.key)}${props.parent.label ? ` · ${props.parent.label}` : ''}`
  return `#${String(props.value)}`
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
const fields = computed(() =>
  preview.value
    ? Object.entries(preview.value.row)
        .filter(([, v]) => v !== null && typeof v !== 'object')
        .slice(0, 8)
    : [],
)
</script>

<template>
  <span v-if="isNull" class="rounded-sm border border-border px-1 text-[10px] uppercase tracking-wide text-type-null italic">{{ t('grid.null') }}</span>
  <HoverCardRoot v-else v-model:open="open" :open-delay="350" :close-delay="80">
    <HoverCardTrigger as-child>
      <button
        type="button"
        class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border px-1.5 leading-5 hover:bg-accent-soft"
        :class="[
          orphan ? 'border-warning/60 bg-warning-soft text-warning' : 'border-border text-fg',
          virtual && !orphan && 'border-dashed',
        ]"
        :data-fk-chip="target"
        :title="orphan ? t('relations.orphan', { target }) : undefined"
        @click="onClick"
        @mousedown.stop
        @dblclick.stop
      >
        <Icon :name="orphan ? 'lucide:triangle-alert' : 'lucide:arrow-up-right'" class="size-3 shrink-0" />
        <span class="truncate" :class="parent === undefined && 'text-fg-subtle'">{{ text }}</span>
      </button>
    </HoverCardTrigger>
    <HoverCardPortal v-if="parent">
      <HoverCardContent
        :side-offset="6"
        class="font-data z-50 w-72 rounded-md border border-border bg-surface p-3 text-xs shadow-pop"
      >
        <p class="mb-2 flex items-center gap-1 text-fg">
          <span class="text-fg-subtle">{{ target }}</span>
          <span>{{ keyLabel(parent.key) }}</span>
        </p>
        <p v-if="failed" class="text-danger">{{ t('relations.previewFailed') }}</p>
        <UiSkeleton v-else-if="!preview" class="h-12" />
        <dl v-else class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <template v-for="[name, v] in fields" :key="name">
            <dt class="text-fg-subtle">{{ name }}</dt>
            <dd class="truncate text-fg">{{ v }}</dd>
          </template>
        </dl>
        <p class="mt-2 text-[10px] text-fg-subtle">{{ t('relations.chipHint') }}</p>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
