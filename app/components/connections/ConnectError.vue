<script setup lang="ts">
/** Why a connection could not be opened: translated reason, the server's own detail apart, and a retry. */
const props = defineProps<{ error: unknown; retrying?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()

const reason = computed(() => t(`errors.${errorCode(props.error)}`))
const detail = computed(() => errorDetail(props.error))
</script>

<template>
  <div role="alert" class="grid gap-2 rounded-md border border-danger/40 bg-danger-soft p-2.5 text-xs" data-connect-error>
    <div class="flex items-start gap-2">
      <Icon name="lucide:unplug" class="mt-px size-4 shrink-0 text-danger" />
      <div class="grid min-w-0 gap-1">
        <p class="font-medium text-fg">{{ t('connections.connectionError') }}</p>
        <p class="text-fg-muted">{{ reason }}</p>
        <p v-if="detail" class="font-data break-words text-fg-subtle">{{ detail }}</p>
      </div>
    </div>
    <UiButton size="sm" :loading="retrying" data-connect-retry @click="emit('retry')">
      <Icon name="lucide:refresh-cw" class="size-3" />{{ t('connections.retry') }}
    </UiButton>
  </div>
</template>
