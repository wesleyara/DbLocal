<script setup lang="ts">
import { useSchemaStore } from '~/stores/schema'
import ErdCanvas from '~/components/erd/ErdCanvas.vue'

const route = useRoute()
const router = useRouter()
const id = route.params.connectionId as string
const schemaName = route.params.schema as string
const { t } = useI18n()
const store = useSchemaStore()
const error = ref(false)
await store.ensure(id, schemaName).catch(() => (error.value = true))

// The focused table and hop count live in the URL, so a filtered diagram is a link.
const focus = computed(() => (typeof route.query.t === 'string' && route.query.t ? route.query.t : null))
const hops = computed(() => {
  const n = Number(route.query.hops)
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 2
})

function setQuery(patch: Record<string, string | undefined>): void {
  const query = Object.entries({ ...route.query, ...patch }).filter(([, v]) => v !== undefined)
  void router.replace({ query: Object.fromEntries(query) })
}
</script>

<template>
  <div class="h-full">
    <UiEmptyState v-if="error" icon="lucide:network" :title="t('erd.loadFailed')" />
    <UiEmptyState v-else-if="!store.tables.length" icon="lucide:network" :title="t('erd.empty')" />
    <ClientOnly v-else>
    <ErdCanvas
      :connection-id="id"
      :schema="schemaName"
      :focus="focus"
      :hops="hops"
      @update:focus="(table) => setQuery({ t: table ?? undefined, hops: table ? String(hops) : undefined })"
      @update:hops="(n) => setQuery({ hops: String(n) })"
    />
    </ClientOnly>
  </div>
</template>
