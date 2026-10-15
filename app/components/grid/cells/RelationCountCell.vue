<script setup lang="ts">
const props = defineProps<{
  /** `undefined` while it loads. */
  count: number | undefined
  /** Name shown next to the number, e.g. `orders`. */
  noun: string
  virtual?: boolean
}>()
const emit = defineEmits<{ open: [newTab: boolean] }>()
const { number } = useFormat()

function onClick(event: MouseEvent): void {
  event.stopPropagation()
  emit('open', event.metaKey || event.ctrlKey)
}
</script>

<template>
  <UiSkeleton v-if="props.count === undefined" class="h-3 w-16" />
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
