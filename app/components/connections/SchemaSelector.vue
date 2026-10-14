<script setup lang="ts">
import type { NamespaceList } from '#shared/types/connection'
import { isSystemNamespace } from '#shared/system-namespaces'

const props = defineProps<{ connectionId: string; current?: string }>()
const { t } = useI18n()
const { message } = useConnectionErrors()
const toast = useToast()

const showSystem = ref(false)

// Same key as the workspace routes, so the namespace list is fetched once per connection.
const { data: namespaces, error } = await useFetch<NamespaceList>(
  `/api/connections/${props.connectionId}/connect`,
  { method: 'POST', key: `namespaces-${props.connectionId}` },
)

const options = computed(() => {
  const dialect = namespaces.value?.dialect
  return (namespaces.value?.namespaces ?? [])
    .filter((n) => showSystem.value || !dialect || !isSystemNamespace(dialect, n))
    .map((n) => ({ value: n, label: n }))
})

const label = computed(() =>
  namespaces.value?.dialect === 'postgres' ? t('schema.label') : t('schema.databaseLabel'),
)

/** Choosing a schema remembers it on the connection and opens its URL, so deep links keep working. */
async function choose(schema: string) {
  if (!schema || schema === props.current) return
  try {
    await $fetch(`/api/connections/${props.connectionId}`, { method: 'PATCH', body: { defaultSchema: schema } })
    await navigateTo(`/c/${props.connectionId}/${encodeURIComponent(schema)}`)
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  }
}

const selected = computed({
  get: () => props.current ?? '',
  set: (value: string) => void choose(value),
})
</script>

<template>
  <div class="flex flex-col gap-2 p-2">
    <p v-if="error" class="text-xs text-danger" role="alert">{{ message(error) }}</p>
    <template v-else>
      <label class="grid gap-1 text-xs text-fg-muted">
        {{ label }}
        <UiSelect v-model="selected" :options="options" :placeholder="t('schema.pick')" />
      </label>
      <UiSwitch v-model="showSystem" class="text-xs" :label="t('schema.showSystem')" />
      <p v-if="options.length === 0" class="text-xs text-fg-subtle">{{ t('schema.empty') }}</p>
    </template>
  </div>
</template>
