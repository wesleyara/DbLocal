<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>()
defineProps<{ label?: string; disabled?: boolean }>()
</script>

<template>
  <label class="inline-flex cursor-default items-center gap-2 text-sm text-fg">
    <SwitchRoot
      v-model="model"
      :disabled="disabled"
      class="relative h-4 w-7 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-accent"
    >
      <SwitchThumb
        class="block size-3 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-3.5"
      />
    </SwitchRoot>
    <slot>{{ label }}</slot>
  </label>
</template>
