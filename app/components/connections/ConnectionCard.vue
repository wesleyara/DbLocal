<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'

const props = defineProps<{ connection: ConnectionView }>()
const emit = defineEmits<{ open: []; edit: []; duplicate: []; delete: [] }>()
const { t } = useI18n()
const { date } = useFormat()

const dialects: Record<ConnectionView['dialect'], string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
}
const envText: Record<ConnectionView['environment'], string> = {
  local: 'text-env-local',
  staging: 'text-env-staging',
  prod: 'text-env-prod',
}
const colorDot: Record<NonNullable<ConnectionView['color']>, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-fg-subtle',
}

const where = computed(() =>
  props.connection.dialect === 'sqlite'
    ? props.connection.filePath
    : `${props.connection.host ?? ''}${props.connection.port ? `:${props.connection.port}` : ''}`,
)
</script>

<template>
  <article
    class="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong"
  >
    <header class="flex items-center gap-2">
      <span
        v-if="connection.color"
        class="size-2 shrink-0 rounded-full"
        :class="colorDot[connection.color]"
        aria-hidden="true"
      />
      <h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{{ connection.name }}</h3>
      <UiBadge>{{ dialects[connection.dialect] }}</UiBadge>
    </header>

    <p class="font-data truncate text-xs text-fg-muted">{{ where }}</p>

    <footer class="mt-1 flex items-center gap-2">
      <span class="font-data text-xs font-medium uppercase" :class="envText[connection.environment]">
        {{ connection.environment }}
      </span>
      <span class="min-w-0 flex-1 truncate text-xs text-fg-subtle">
        {{
          connection.lastUsedAt
            ? t('connections.lastUsed', { when: date(connection.lastUsedAt, { dateStyle: 'short', timeStyle: 'short' }) })
            : t('connections.neverUsed')
        }}
      </span>
      <UiIconButton icon="lucide:plug" :label="t('connections.open')" size="sm" @click="emit('open')" />
      <UiIconButton icon="lucide:pencil" :label="t('connections.edit')" size="sm" @click="emit('edit')" />
      <UiIconButton icon="lucide:copy" :label="t('connections.duplicate')" size="sm" @click="emit('duplicate')" />
      <UiIconButton icon="lucide:trash-2" :label="t('common.delete')" size="sm" @click="emit('delete')" />
    </footer>
  </article>
</template>
