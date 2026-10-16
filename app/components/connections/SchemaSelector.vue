<script setup lang="ts">
import { isSystemNamespace } from '#shared/system-namespaces'
import { useSchemaStore } from '~/stores/schema'

const props = defineProps<{ connectionId: string; current?: string }>()
const { t } = useI18n()
const { message } = useConnectionErrors()
const toast = useToast()

const showSystem = ref(false)

const { data: namespaces, error, status, refresh } = await useNamespaces(props.connectionId)
const store = useSchemaStore()

/** Connects again and, once it works, reloads the table tree that failed with it. */
async function retry() {
  await refresh()
  if (!error.value && props.current) await store.load(props.connectionId, props.current).catch(() => {})
}

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
    <ConnectionsConnectError v-if="error" :error="error" :retrying="status === 'pending'" @retry="retry" />
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
