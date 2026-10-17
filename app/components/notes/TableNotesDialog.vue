<script setup lang="ts">
import type { NoteStatus } from '~/composables/useNote'

/** Markdown note of one table, opened by "Notes" in the grid toolbar. The note is loaded by the page (`useNote`). */
defineProps<{ table: string; status: NoteStatus; updatedAt: string | null }>()
const open = defineModel<boolean>('open', { required: true })
const content = defineModel<string>('content', { required: true })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

watch(open, (v) => !v && emit('close'))
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('notes.tableTitle', { table })" :description="t('notes.tableHint')">
    <div data-table-notes>
      <NotesNotePanel
        v-model="content"
        :status="status"
        :updated-at="updatedAt"
        height="min(60vh, 32rem)"
        :placeholder="t('notes.tablePlaceholder')"
      />
    </div>
  </UiDialog>
</template>
