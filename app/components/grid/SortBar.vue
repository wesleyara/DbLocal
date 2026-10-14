<script setup lang="ts">
import type { SortItem } from '#shared/types/rows'

const props = defineProps<{ sort: SortItem[] }>()
const emit = defineEmits<{ change: [sort: SortItem[]] }>()
const { t } = useI18n()

/** Index of the chip being dragged, so the drop knows where it came from. */
const dragging = ref<number | null>(null)

function toggle(index: number): void {
  emit(
    'change',
    props.sort.map((s, i) => (i === index ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s)),
  )
}

function remove(index: number): void {
  emit('change', props.sort.filter((_, i) => i !== index))
}

function drop(target: number): void {
  const from = dragging.value
  dragging.value = null
  if (from === null || from === target) return
  const next = [...props.sort]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved!)
  emit('change', next)
}
</script>

<template>
  <div v-if="sort.length" class="flex flex-wrap items-center gap-1.5">
    <span class="text-xs text-fg-subtle">{{ t('grid.sortBy') }}</span>
    <span
      v-for="(item, index) in sort"
      :key="`${item.column}-${index}`"
      draggable="true"
      class="font-data inline-flex h-6 cursor-grab items-center gap-1 rounded-md border border-border bg-surface pl-1.5 pr-0.5 text-xs text-fg"
      :title="t('grid.dragToReorder')"
      @dragstart="dragging = index"
      @dragover.prevent
      @drop.prevent="drop(index)"
    >
      <Icon name="lucide:grip-vertical" class="size-3 text-fg-subtle" />
      <button type="button" class="inline-flex items-center gap-1 hover:text-accent" :aria-label="item.direction === 'asc' ? t('grid.sortAscending') : t('grid.sortDescending')" @click="toggle(index)">
        {{ item.column }}
        <Icon :name="item.direction === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="size-3" />
      </button>
      <button type="button" class="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle hover:text-fg" :aria-label="t('grid.sortRemove')" @click="remove(index)">
        <Icon name="lucide:x" class="size-3" />
      </button>
    </span>
    <button type="button" class="text-xs text-fg-subtle hover:text-fg" @click="emit('change', [])">{{ t('grid.clearSort') }}</button>
  </div>
</template>
