<script setup lang="ts">
const props = withDefaults(
  defineProps<{ icon: string; label: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' }>(),
  { size: 'md', variant: 'ghost' },
)
</script>

<template>
  <button
    type="button"
    :aria-label="props.label"
    :title="props.label"
    class="inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
    :class="[
      props.size === 'sm' ? 'size-6' : 'size-7',
      props.variant === 'ghost'
        ? 'text-fg-muted hover:bg-surface hover:text-fg'
        : 'border border-border bg-surface text-fg hover:bg-surface-hover',
    ]"
  >
    <Icon :name="props.icon" class="size-4" />
  </button>
</template>
