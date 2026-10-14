<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

const model = defineModel<boolean | 'indeterminate'>()
defineProps<{ label?: string; disabled?: boolean }>()
</script>

<template>
  <label class="inline-flex cursor-default items-center gap-2 text-sm text-fg">
    <CheckboxRoot
      v-model="model"
      :disabled="disabled"
      class="flex size-4 items-center justify-center rounded-sm border border-border-strong bg-bg-subtle data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent"
    >
      <CheckboxIndicator class="text-accent-fg">
        <Icon :name="model === 'indeterminate' ? 'lucide:minus' : 'lucide:check'" class="size-3" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <slot>{{ label }}</slot>
  </label>
</template>
