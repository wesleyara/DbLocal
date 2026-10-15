<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const model = defineModel<string>()
defineProps<{ invalid?: boolean; mono?: boolean }>()
</script>

<template>
  <textarea
    v-model="model"
    v-bind="$attrs"
    class="ui-field min-h-16 w-full rounded-md border bg-bg-subtle px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle disabled:opacity-50"
    :class="[invalid ? 'border-danger' : 'border-border', mono && 'font-data']"
  />
</template>
