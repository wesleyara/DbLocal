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
const props = withDefaults(
  defineProps<{ title: string; description?: string; side?: 'right' | 'left'; closeLabel?: string; wide?: boolean; elevated?: boolean }>(),
  { side: 'right', description: undefined, closeLabel: undefined, wide: false, elevated: false },
)
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/40" :class="props.elevated ? 'z-[60]' : 'z-40'" />
      <DialogContent
        class="fixed inset-y-0 flex flex-col border-border bg-surface shadow-pop"
        :class="[props.elevated ? 'z-[61]' : 'z-50', props.side === 'right' ? 'right-0 border-l' : 'left-0 border-r', props.wide ? 'w-[min(40rem,96vw)]' : 'w-[min(28rem,92vw)]']"
      >
        <div class="flex items-start justify-between gap-4 border-b border-border p-4">
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
        <div class="min-h-0 flex-1 overflow-auto p-4"><slot /></div>
        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-border p-3"><slot name="footer" /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
