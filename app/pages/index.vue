<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'

const { t } = useI18n()
const toast = useToast()
const { message } = useConnectionErrors()

// Fetched on the server too, so the first render already has the list.
const { data, pending, refresh } = await useFetch<ConnectionView[]>('/api/connections', { key: 'connections' })
const items = computed(() => data.value ?? [])

const search = ref('')
const formOpen = ref(false)
const editing = ref<ConnectionView | null>(null)
const pendingDelete = ref<ConnectionView | null>(null)
const deleteOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (v) => {
    if (!v) pendingDelete.value = null
  },
})

/** Most recently used first; never-used connections fall back to name order. */
const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value
    .filter((c) => !q || [c.name, c.host, c.filePath, c.dialect].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (a.lastUsedAt && b.lastUsedAt) return b.lastUsedAt.localeCompare(a.lastUsedAt)
      if (a.lastUsedAt) return -1
      if (b.lastUsedAt) return 1
      return a.name.localeCompare(b.name)
    })
})

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(c: ConnectionView) {
  editing.value = c
  formOpen.value = true
}

async function duplicate(c: ConnectionView) {
  try {
    await $fetch(`/api/connections/${c.id}/duplicate`, { method: 'POST' })
    await refresh()
    toast.push({ kind: 'success', title: t('connections.toast.duplicated') })
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  }
}

async function confirmDelete() {
  const target = pendingDelete.value
  if (!target) return
  try {
    await $fetch(`/api/connections/${target.id}`, { method: 'DELETE' })
    await refresh()
    toast.push({ kind: 'success', title: t('connections.toast.deleted') })
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  } finally {
    pendingDelete.value = null
  }
}

async function onSaved() {
  toast.push({ kind: 'success', title: t('connections.toast.saved') })
  await refresh()
}
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
    <header class="flex flex-wrap items-center gap-4">
      <UiLogo class="size-12" />
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight text-fg">{{ t('connections.title') }}</h1>
        <p class="text-sm text-fg-muted">{{ t('home.subtitle') }}</p>
      </div>
      <div class="ml-auto flex w-full items-center gap-2 sm:w-auto">
        <UiInput
          v-model="search"
          class="!h-8 sm:w-64"
          :placeholder="t('connections.search')"
          :aria-label="t('connections.search')"
        />
        <UiButton variant="primary" @click="openCreate">
          <Icon name="lucide:plus" class="size-3.5" />
          {{ t('connections.new') }}
        </UiButton>
      </div>
    </header>

    <UiEmptyState
      v-if="!pending && items.length === 0"
      class="rounded-lg border border-dashed border-border py-16"
      icon="lucide:database"
      :title="t('connections.empty')"
      :description="t('connections.emptyHint')"
    >
      <UiButton variant="primary" @click="openCreate">{{ t('connections.new') }}</UiButton>
    </UiEmptyState>

    <p v-else-if="items.length > 0 && visible.length === 0" class="py-8 text-center text-sm text-fg-muted">
      {{ t('connections.noMatches') }}
    </p>

    <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ConnectionsConnectionCard
        v-for="c in visible"
        :key="c.id"
        :connection="c"
        @open="navigateTo(`/c/${c.id}`)"
        @edit="openEdit(c)"
        @duplicate="duplicate(c)"
        @delete="pendingDelete = c"
      />
    </div>

    <ConnectionsConnectionForm v-model:open="formOpen" :connection="editing" @saved="onSaved" />

    <UiDialog
      v-model:open="deleteOpen"
      :title="t('connections.delete.title')"
      :description="t('connections.delete.description', { name: pendingDelete?.name ?? '' })"
    >
      <template #footer>
        <UiButton variant="ghost" @click="pendingDelete = null">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="danger" @click="confirmDelete">{{ t('connections.delete.confirm') }}</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
