<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'

interface Option {
  value: string
  label: string
}
const model = defineModel<string>()
const props = defineProps<{ options: Option[]; placeholder?: string; emptyText?: string }>()
const selected = computed(() => props.options.find((o) => o.value === model.value))
</script>

<template>
  <ComboboxRoot v-model="model" :display-value="() => selected?.label ?? ''">
    <ComboboxAnchor
      class="inline-flex h-7 min-w-40 items-center rounded-md border border-border bg-bg-subtle px-2 focus-within:border-accent focus-within:shadow-[inset_0_0_0_1px_var(--accent)]"
    >
      <ComboboxInput
        class="w-full bg-transparent text-sm text-fg outline-none! placeholder:text-fg-subtle"
        :placeholder="placeholder"
      />
      <Icon name="lucide:chevrons-up-down" class="size-3.5 shrink-0 text-fg-subtle" />
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 w-[var(--reka-combobox-trigger-width)] max-w-[var(--reka-combobox-content-available-width)] rounded-md border border-border bg-surface p-1 shadow-pop"
      >
        <ComboboxViewport class="ui-popup-scroll max-h-[min(15rem,var(--reka-combobox-content-available-height))]">
          <ComboboxEmpty class="px-2 py-1.5 text-sm text-fg-subtle">
            {{ emptyText }}
          </ComboboxEmpty>
          <ComboboxItem
            v-for="o in options"
            :key="o.value"
            :value="o.value"
            :text-value="o.label"
            class="flex h-7 cursor-default items-center rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
            :title="o.label"
          >
            <span class="min-w-0 truncate">{{ o.label }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
