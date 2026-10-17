<script setup lang="ts">
import type { StatementKind } from '#shared/types/query'
import { summarizeStatements, type SqlDialect } from '#shared/sql-split'

/**
 * "Alert before run": lists the statements about to run and what each one does (reads, changes
 * rows, changes the schema, unknown) before anything is sent. Confirming counts as the production
 * confirmation too, since the same statements are on screen.
 */
const props = defineProps<{ sql: string | null; dialect: SqlDialect; prod?: boolean }>()
const emit = defineEmits<{ confirm: [sql: string]; cancel: [] }>()
const { t } = useI18n()

const statements = computed(() => (props.sql ? summarizeStatements(props.sql, props.dialect) : []))
const changes = computed(() => statements.value.some((s) => s.kind !== 'read'))

const tone: Record<StatementKind, 'success' | 'warning' | 'danger' | 'neutral'> = {
  read: 'success',
  write: 'warning',
  ddl: 'danger',
  other: 'neutral',
}

function confirm(): void {
  if (props.sql) emit('confirm', props.sql)
}
</script>

<template>
  <UiDialog
    :open="sql !== null"
    :title="t('query.alert.title')"
    :description="t('query.alert.description', { count: statements.length })"
    @update:open="(v) => !v && emit('cancel')"
  >
    <ol class="flex max-h-80 flex-col gap-2 overflow-x-hidden overflow-y-auto" data-run-confirm>
      <li v-for="(s, i) in statements" :key="i" class="min-w-0 shrink-0 rounded-md border border-border bg-bg-subtle" :data-kind="s.kind">
        <div class="flex items-center gap-2 border-b border-border px-2 py-1 text-xs">
          <span class="font-data shrink-0 text-fg-subtle">{{ i + 1 }}</span>
          <UiBadge class="shrink-0" :tone="tone[s.kind]">{{ t(`query.alert.kinds.${s.kind}.label`) }}</UiBadge>
          <span class="min-w-0 text-fg-muted">{{ t(`query.alert.kinds.${s.kind}.text`, { verb: s.verb ?? '' }) }}</span>
        </div>
        <pre class="font-data max-h-32 overflow-auto p-2 text-xs break-all whitespace-pre-wrap text-fg">{{ s.sql }}</pre>
      </li>
    </ol>
    <p v-if="prod && changes" class="mt-2 flex items-center gap-1.5 text-xs text-danger">
      <Icon name="lucide:triangle-alert" class="size-3.5" />{{ t('query.confirmProd') }}
    </p>
    <template #footer>
      <UiButton @click="emit('cancel')">{{ t('common.cancel') }}</UiButton>
      <UiButton :variant="changes ? 'danger' : 'primary'" data-confirm-alert-run @click="confirm">
        <Icon name="lucide:play" class="size-3.5" />{{ t('query.run') }}
      </UiButton>
    </template>
  </UiDialog>
</template>
