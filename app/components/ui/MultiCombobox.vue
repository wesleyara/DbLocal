<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'

interface Option {
  value: string
  label: string
}
/** Several values at once; an empty list means "no restriction" and shows the placeholder. */
const model = defineModel<string[]>({ default: () => [] })
const props = defineProps<{ options: Option[]; placeholder?: string; emptyText?: string }>()
const search = ref('')
const chips = computed(() => model.value.map((v) => props.options.find((o) => o.value === v)).filter((o): o is Option => !!o))

function remove(value: string): void {
  model.value = model.value.filter((v) => v !== value)
}
function onBackspace(): void {
  if (!search.value && model.value.length) model.value = model.value.slice(0, -1)
}
</script>

<template>
  <ComboboxRoot v-model="model" v-model:search-term="search" multiple open-on-click open-on-focus class="w-full">
    <ComboboxAnchor
      class="flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md border border-border bg-bg-subtle px-1.5 py-0.5 focus-within:border-accent focus-within:shadow-[inset_0_0_0_1px_var(--accent)]"
    >
      <span
        v-for="c in chips"
        :key="c.value"
        class="inline-flex h-5 items-center gap-1 rounded-sm border border-accent/40 bg-accent-soft pl-1.5 text-xs text-accent"
        data-multi-chip
      >
        {{ c.label }}
        <button type="button" class="grid size-5 place-items-center rounded-sm hover:bg-accent/15" :aria-label="c.label" @click.stop="remove(c.value)">
          <Icon name="lucide:x" class="size-3" />
        </button>
      </span>
      <ComboboxInput
        v-model="search"
        class="min-w-16 flex-1 bg-transparent text-sm text-fg outline-none! placeholder:text-fg-subtle"
        :placeholder="chips.length ? '' : placeholder"
        @keydown.backspace="onBackspace"
      />
      <ComboboxTrigger class="grid size-5 shrink-0 place-items-center text-fg-subtle" tabindex="-1">
        <Icon name="lucide:chevrons-up-down" class="size-3.5" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper"
        :side-offset="4"
        class="z-50 w-[var(--reka-combobox-trigger-width)] max-w-[var(--reka-combobox-content-available-width)] rounded-md border border-border bg-surface p-1 shadow-pop"
      >
        <ComboboxViewport class="ui-popup-scroll max-h-[min(15rem,var(--reka-combobox-content-available-height))]">
          <ComboboxEmpty class="px-2 py-1.5 text-sm text-fg-subtle">{{ emptyText }}</ComboboxEmpty>
          <ComboboxItem
            v-for="o in options"
            :key="o.value"
            :value="o.value"
            :text-value="o.label"
            class="flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
          >
            <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
            <ComboboxItemIndicator><Icon name="lucide:check" class="size-3.5 text-accent" /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
