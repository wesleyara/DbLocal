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
    class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm px-1 leading-5 tabular-nums hover:bg-accent-soft"
    :class="[props.count === 0 ? 'text-fg-subtle' : 'text-accent', props.virtual && 'italic']"
    :data-relation-count="noun"
    @click="onClick"
    @mousedown.stop
    @dblclick.stop
  >
    <span>{{ number(props.count) }}</span>
    <span class="truncate">{{ noun }}</span>
    <Icon name="lucide:arrow-right" class="size-3 shrink-0" />
  </button>
</template>
