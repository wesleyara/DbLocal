<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'

/** Markdown notes of the connection (one per connection, whatever the schema), a workspace tab of type `notes`. */
const route = useRoute()
const id = route.params.connectionId as string
const { t } = useI18n()
const { data: view } = await useFetch<ConnectionView>(`/api/connections/${id}`, { key: `connection-${id}` })
const note = useNote(() => ({ url: `/api/c/${id}/notes` }))
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header v-if="view" class="flex items-center gap-2 border-b border-border px-3 py-1.5">
      <h1 class="truncate text-sm font-semibold text-fg">{{ view.name }}</h1>
      <span class="text-xs text-fg-subtle">{{ t('notes.connectionTitle') }}</span>
    </header>
    <section class="flex min-h-0 flex-1 flex-col p-4" data-connection-notes>
      <ClientOnly>
        <NotesNotePanel
          v-model="note.content.value"
          :status="note.status.value"
          :updated-at="note.updatedAt.value"
          height="calc(100dvh - 13rem)"
          :placeholder="t('notes.connectionPlaceholder')"
        />
      </ClientOnly>
    </section>
  </div>
</template>
