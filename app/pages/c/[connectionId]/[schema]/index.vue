<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'

const route = useRoute()
const id = route.params.connectionId as string
const { t } = useI18n()

// Old links used `?table=`; they keep working by redirecting to the table path.
if (typeof route.query.table === 'string') {
  const { table, ...rest } = route.query
  await navigateTo(
    { path: `/c/${id}/${encodeURIComponent(route.params.schema as string)}/t/${encodeURIComponent(table)}`, query: rest },
    { replace: true },
  )
}

const { data: view } = await useFetch<ConnectionView>(`/api/connections/${id}`, { key: `connection-${id}` })
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header v-if="view" class="flex items-center gap-2 border-b border-border px-3 py-1.5">
      <h1 class="truncate text-sm font-semibold text-fg">{{ view.name }}</h1>
      <span class="font-data ml-auto truncate text-xs text-fg-muted">{{ route.params.schema }}</span>
    </header>
    <UiEmptyState icon="lucide:table-2" :title="t('shell.noTable')" :description="t('shell.noTableHint')" />
  </div>
</template>
