<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{ variant?: Variant; size?: Size; type?: 'button' | 'submit'; loading?: boolean; disabled?: boolean }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
)

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-hover',
  ghost: 'text-fg-muted hover:bg-surface hover:text-fg',
  danger: 'bg-danger-soft text-danger border border-danger/40 hover:bg-danger/20',
}
const sizes: Record<Size, string> = {
  sm: 'h-6 px-2 text-xs gap-1',
  md: 'h-7 px-3 text-sm gap-1.5',
  lg: 'h-9 px-4 text-base gap-2',
}
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled || props.loading"
    class="inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
    :class="[variants[props.variant], sizes[props.size]]"
  >
    <UiSpinner v-if="props.loading" class="size-3.5" />
    <slot />
  </button>
</template>
