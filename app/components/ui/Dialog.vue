<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })
defineProps<{ title: string; description?: string; closeLabel?: string; wide?: boolean }>()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-border bg-surface p-4 shadow-pop"
        :class="wide ? 'w-[min(64rem,94vw)]' : 'w-[min(32rem,92vw)]'"
      >
        <div class="mb-3 flex items-start justify-between gap-4">
          <div>
            <DialogTitle class="text-lg font-semibold text-fg">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-sm text-fg-muted">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <UiIconButton icon="lucide:x" :label="closeLabel ?? t('common.close')" size="sm" />
          </DialogClose>
        </div>
        <slot />
        <div v-if="$slots.footer" class="mt-4 flex justify-end gap-2">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
