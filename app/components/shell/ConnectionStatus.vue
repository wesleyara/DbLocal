<script setup lang="ts">
/** Status bar entry of the open connection, from the same connect call as the sidebar. */
const props = defineProps<{ connectionId: string; name: string; dialect: string; readonly: boolean }>()
const { t } = useI18n()

const { error, status, refresh } = useNamespaces(props.connectionId)

const state = computed(() => {
  if (error.value) return 'failed'
  return status.value === 'success' ? 'connected' : 'connecting'
})
const label = computed(() => t(`shell.status.${state.value}`, { name: props.name }))
const DOT = { connected: 'bg-success', connecting: 'bg-fg-subtle animate-pulse', failed: 'bg-danger' } as const
</script>

<template>
  <span class="size-2 shrink-0 rounded-full" :class="DOT[state]" role="img" :aria-label="label" data-status-dot :data-state="state" />
  <span :class="state === 'failed' ? 'text-danger' : undefined">{{ label }}</span>
  <template v-if="state === 'failed'">
    <span class="truncate">{{ t(`errors.${errorCode(error)}`) }}</span>
    <button type="button" class="text-fg-muted underline-offset-2 hover:text-fg hover:underline" @click="refresh()">
      {{ t('connections.retry') }}
    </button>
  </template>
  <span>{{ dialect }}</span>
  <span v-if="readonly" class="text-warning">{{ t('shell.status.readonly') }}</span>
</template>
