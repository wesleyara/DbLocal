<script setup lang="ts">
type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' })
const tones: Record<Tone, string> = {
  neutral: 'bg-surface text-fg-muted border-border',
  accent: 'bg-accent-soft text-accent border-accent/30',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
}
</script>

<template>
  <span
    class="inline-flex h-5 items-center rounded-sm border px-1.5 text-xs font-medium"
    :class="tones[tone]"
  >
    <slot />
  </span>
</template>
