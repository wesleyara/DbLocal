<script setup lang="ts">
import type { NoteStatus } from '~/composables/useNote'
import { useToast } from '~/composables/useToast'
import type { NoteExport } from './export-pdf'

/**
 * Save status line + Markdown editor of a note. The note itself (load, autosave) is `useNote`'s.
 * With `exportAs`, an "Export PDF" button prints the note (`export-pdf.ts`).
 */
const props = withDefaults(
  defineProps<{ status: NoteStatus; updatedAt: string | null; height?: string; placeholder?: string; exportAs?: NoteExport }>(),
  { height: '360px', placeholder: '', exportAs: undefined },
)
const content = defineModel<string>({ required: true })
const { t, locale } = useI18n()
const { date } = useFormat()
const toast = useToast()

const exporting = ref(false)
async function exportPdf(): Promise<void> {
  if (!props.exportAs || exporting.value) return
  exporting.value = true
  try {
    const { exportNotePdf } = await import('./export-pdf')
    const meta = [
      ...(props.exportAs.meta ?? []),
      props.updatedAt ? t('notes.pdf.editedAt', { time: date(props.updatedAt) }) : '',
      t('notes.pdf.exportedAt', { time: date(new Date()) }),
    ]
    await exportNotePdf(content.value, { ...props.exportAs, meta, lang: locale.value })
  } catch {
    toast.push({ kind: 'error', title: t('notes.pdf.failed') })
  } finally {
    exporting.value = false
  }
}

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
      <UiButton
        v-if="exportAs"
        class="ml-auto"
        size="sm"
        variant="ghost"
        :loading="exporting"
        :disabled="status === 'loading' || !content.trim()"
        :title="t('notes.pdf.hint')"
        data-note-export-pdf
        @click="exportPdf"
      >
        <Icon v-if="!exporting" name="lucide:file-down" class="size-3.5" />
        {{ t('notes.pdf.export') }}
      </UiButton>
    </div>
    <div v-if="status === 'loading'" class="rounded-md border border-border" :style="{ height }">
      <UiSkeleton class="m-3 h-4 w-1/2" />
    </div>
    <LazyNotesMarkdownEditor v-else v-model="content" :height="height" :placeholder="placeholder" />
  </div>
</template>
