<script setup lang="ts">
import { ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'

const { toasts, dismiss } = useToast()
const tone = {
  info: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
} as const
</script>

<template>
  <ToastProvider>
    <ToastRoot
      v-for="t in toasts"
      :key="t.id"
      :duration="t.duration"
      class="rounded-md border border-border bg-surface p-3 shadow-pop"
      @update:open="(o: boolean) => !o && dismiss(t.id)"
    >
      <ToastTitle class="text-sm font-medium" :class="tone[t.kind]">{{ t.title }}</ToastTitle>
      <ToastDescription v-if="t.description" class="mt-0.5 text-xs text-fg-muted">
        {{ t.description }}
      </ToastDescription>
    </ToastRoot>
    <ToastViewport
      class="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[92vw] flex-col gap-2 outline-none"
    />
  </ToastProvider>
</template>
