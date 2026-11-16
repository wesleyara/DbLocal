<script setup lang="ts">
import type { NoteStatus } from '~/composables/useNote'

/** Markdown note of one table, opened by "Notes" in the grid toolbar. The note is loaded by the page (`useNote`). */
const props = defineProps<{ table: string; schema?: string; connectionName?: string; status: NoteStatus; updatedAt: string | null }>()
const open = defineModel<boolean>('open', { required: true })
const content = defineModel<string>('content', { required: true })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

watch(open, (v) => !v && emit('close'))

const exportAs = computed(() => ({
  title: props.table,
  eyebrow: `DbLocal · ${t('notes.pdf.tableNotes')}`,
  meta: [
    props.connectionName ? t('notes.pdf.connection', { name: props.connectionName }) : '',
    props.schema ? t('notes.pdf.schema', { schema: props.schema }) : '',
  ],
}))
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('notes.tableTitle', { table })" :description="t('notes.tableHint')">
    <div data-table-notes>
      <NotesNotePanel
        v-model="content"
        :status="status"
        :updated-at="updatedAt"
        :export-as="exportAs"
        height="min(60vh, 32rem)"
        :placeholder="t('notes.tablePlaceholder')"
      />
    </div>
  </UiDialog>
</template>
