<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const model = defineModel<string | number>()
defineProps<{ invalid?: boolean; mono?: boolean }>()
</script>

<template>
  <input
    v-model="model"
    v-bind="$attrs"
    class="ui-field h-7 w-full rounded-md border bg-bg-subtle px-2 text-sm text-fg placeholder:text-fg-subtle disabled:opacity-50"
    :class="[invalid ? 'border-danger' : 'border-border', mono && 'font-data']"
  >
</template>
