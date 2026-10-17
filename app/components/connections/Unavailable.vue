<script setup lang="ts">
import { useSchemaStore } from '~/stores/schema'

/**
 * Shown in place of a page that needs the schema when the database cannot be reached (server down,
 * wrong credentials...). The app shell stays: the sidebar, the tabs and the other connections still work,
 * instead of the whole app turning into Nuxt's error page.
 */
const props = defineProps<{ connectionId: string; schema: string; error: unknown }>()
const { t } = useI18n()
const { message } = useConnectionErrors()
const store = useSchemaStore()
const retrying = ref(false)

async function retry(): Promise<void> {
  retrying.value = true
  try {
    await store.load(props.connectionId, props.schema)
  } catch {
    // the new error is in the store and shown here again
  } finally {
    retrying.value = false
  }
}
</script>

<template>
  <div data-connection-unavailable>
    <UiEmptyState icon="lucide:unplug" :title="t('connections.connectionError')" :description="message(error)">
      <div class="flex items-center gap-2">
        <UiButton variant="primary" :loading="retrying" data-unavailable-retry @click="retry">
          <Icon name="lucide:refresh-cw" class="size-3.5" />{{ t('connections.retry') }}
        </UiButton>
        <UiButton data-unavailable-home @click="navigateTo('/')">{{ t('connections.backToList') }}</UiButton>
      </div>
    </UiEmptyState>
  </div>
</template>
