<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'

defineOptions({ inheritAttrs: false })
/** A free-text field with a list of suggestions (column types): pick one or type any other. */
const model = defineModel<string>({ default: '' })
const props = defineProps<{ options: string[]; placeholder?: string }>()
const open = ref(false)
const typing = ref(false)

// Showing the type already chosen narrows the list to itself; list everything until the user types.
const shown = computed(() => {
  const q = model.value.trim().toLowerCase()
  if (!typing.value || !q) return props.options
  const hits = props.options.filter((o) => o.toLowerCase().includes(q))
  return hits.length ? hits : []
})

function onInput(event: Event): void {
  typing.value = true
  model.value = (event.target as HTMLInputElement).value
  open.value = true
}
function pick(value: unknown): void {
  if (typeof value === 'string') model.value = value
  typing.value = false
  open.value = false
}
</script>

<template>
  <ComboboxRoot v-model:open="open" :model-value="model" :display-value="(v: unknown) => String(v ?? '')" ignore-filter open-on-focus open-on-click @update:model-value="pick">
    <ComboboxAnchor
      class="flex h-7 w-full items-center rounded-md border border-border bg-bg-subtle px-2 focus-within:border-accent focus-within:shadow-[inset_0_0_0_1px_var(--accent)]"
    >
      <ComboboxInput
        :model-value="model"
        class="font-data w-full bg-transparent text-sm text-fg outline-none! placeholder:text-fg-subtle"
        :placeholder="placeholder"
        v-bind="$attrs"
        spellcheck="false"
        autocomplete="off"
        @input="onInput"
        @blur="typing = false"
      />
      <Icon name="lucide:chevrons-up-down" class="size-3.5 shrink-0 text-fg-subtle" />
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        v-if="shown.length"
        position="popper"
        :side-offset="4"
        class="z-[60] w-[var(--reka-combobox-trigger-width)] min-w-44 max-w-[var(--reka-combobox-content-available-width)] rounded-md border border-border bg-surface p-1 shadow-pop"
      >
        <ComboboxViewport class="ui-popup-scroll max-h-[min(15rem,var(--reka-combobox-content-available-height))]">
          <ComboboxItem
            v-for="o in shown"
            :key="o"
            :value="o"
            class="font-data flex h-7 cursor-default items-center rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
          >
            <span class="min-w-0 truncate">{{ o }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
