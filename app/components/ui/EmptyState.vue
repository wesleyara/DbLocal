<script setup lang="ts">
defineProps<{ icon?: string; title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 p-8 text-center">
    <Icon v-if="icon" :name="icon" class="size-8 text-fg-subtle" />
    <h3 class="text-base font-medium text-fg">{{ title }}</h3>
    <p v-if="description" class="max-w-sm text-sm text-fg-muted">{{ description }}</p>
    <div v-if="$slots.default" class="mt-2"><slot /></div>
  </div>
</template>
