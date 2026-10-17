<script setup lang="ts">
import type { NoteStatus } from '~/composables/useNote'

/** Save status line + Markdown editor of a note. The note itself (load, autosave) is `useNote`'s. */
const props = withDefaults(
  defineProps<{ status: NoteStatus; updatedAt: string | null; height?: string; placeholder?: string }>(),
  { height: '360px', placeholder: '' },
)
const content = defineModel<string>({ required: true })
const { t } = useI18n()
const { date } = useFormat()

const statusText = computed(() => {
  switch (props.status) {
    case 'loading':
      return t('notes.status.loading')
    case 'saving':
      return t('notes.status.saving')
    case 'error':
      return t('notes.status.error')
    default:
      return props.updatedAt ? t('notes.status.savedAt', { time: date(props.updatedAt) }) : t('notes.status.autosave')
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-col gap-2" data-note-panel>
    <div class="flex items-center gap-1.5 text-xs" :class="status === 'error' ? 'text-danger' : 'text-fg-subtle'" data-note-status :data-status="status">
      <UiSpinner v-if="status === 'saving' || status === 'loading'" class="size-3" />
      <Icon v-else-if="status === 'error'" name="lucide:triangle-alert" class="size-3" />
      <Icon v-else name="lucide:cloud-check" class="size-3" />
      {{ statusText }}
      <HelpHint id="notes.overview" />
    </div>
    <div v-if="status === 'loading'" class="rounded-md border border-border" :style="{ height }">
      <UiSkeleton class="m-3 h-4 w-1/2" />
    </div>
    <LazyNotesMarkdownEditor v-else v-model="content" :height="height" :placeholder="placeholder" />
  </div>
</template>
