<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import { isSystemNamespace } from '#shared/system-namespaces'

const route = useRoute()
const id = route.params.connectionId as string
const { t } = useI18n()
const { message } = useConnectionErrors()

// Same keys as the sidebar selector, so the connect call is made once per page load.
const { data: view, error: viewError } = await useFetch<ConnectionView>(`/api/connections/${id}`, {
  key: `connection-${id}`,
})
const { data: namespaces, error: connectError } = await useNamespaces(id)

/** Last schema the user picked, else the first non-system namespace, else the first one. */
const target = computed(() => {
  const list = namespaces.value?.namespaces ?? []
  if (view.value?.defaultSchema && list.includes(view.value.defaultSchema)) return view.value.defaultSchema
  const dialect = namespaces.value?.dialect
  return (
    list.find((n) => dialect && !isSystemNamespace(dialect, n)) ?? list[0] ?? null
  )
})

if (target.value) {
  await navigateTo(`/c/${id}/${encodeURIComponent(target.value)}`, { replace: true })
}

const failure = computed(() => {
  if (viewError.value?.statusCode === 404 || connectError.value) {
    return connectError.value ? message(connectError.value) : t('errors.notFound')
  }
  return null
})
</script>

<template>
  <UiEmptyState
    v-if="failure"
    icon="lucide:triangle-alert"
    :title="t('connections.connectionError')"
    :description="failure"
  >
    <UiButton variant="secondary" @click="navigateTo('/')">{{ t('connections.title') }}</UiButton>
  </UiEmptyState>
  <UiEmptyState v-else-if="namespaces && !target" icon="lucide:database" :title="t('schema.empty')" />
</template>
