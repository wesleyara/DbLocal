<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

export interface Option {
  value: string
  label: string
}
const model = defineModel<string>()
const props = defineProps<{ options: Option[]; placeholder?: string; disabled?: boolean }>()

// The trigger text is derived from the options instead of read back from the (portalled) items,
// so it follows label changes such as a locale switch while the menu is closed.
const selectedLabel = computed(() => props.options.find((o) => o.value === model.value)?.label)
</script>

<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger
      class="inline-flex h-7 min-w-28 max-w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-subtle px-2 text-sm text-fg hover:bg-surface disabled:opacity-50"
    >
      <SelectValue :placeholder="placeholder" class="truncate" :title="selectedLabel">{{ selectedLabel }}</SelectValue>
      <Icon name="lucide:chevrons-up-down" class="size-3.5 shrink-0 text-fg-subtle" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="z-50 flex max-h-[min(20rem,var(--reka-select-content-available-height))] min-w-[var(--reka-select-trigger-width)] max-w-[min(24rem,var(--reka-select-content-available-width))] flex-col rounded-md border border-border bg-surface p-1 shadow-pop"
      >
        <SelectViewport class="ui-popup-scroll">
          <SelectItem
            v-for="o in options"
            :key="o.value"
            :value="o.value"
            class="flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
          >
            <SelectItemText class="min-w-0 truncate" :title="o.label">{{ o.label }}</SelectItemText>
            <SelectItemIndicator class="ml-auto shrink-0">
              <Icon name="lucide:check" class="size-3.5 text-accent" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
