<script setup lang="ts">
import type { StatementKind } from '#shared/types/query'
import { assessScript, type StatementRisk } from '#shared/sql-risk'
import { summarizeStatements, type SqlDialect } from '#shared/sql-split'
import { useUiStore } from '~/stores/ui'

/**
 * Lists the statements about to run and what each one does (reads, changes rows, changes the
 * schema, unknown) before anything is sent. Destructive statements (`assessScript`: DROP,
 * TRUNCATE, DELETE / UPDATE without WHERE, ALTER ... DROP) are spelled out with a warning, and
 * then, like writes on `prod`, the connection's name has to be typed: a second, deliberate check.
 * Confirming sends `confirmWrites`, which the server requires for all of these.
 */
const props = defineProps<{ sql: string | null; dialect: SqlDialect; prod?: boolean; connectionName?: string | null }>()
const emit = defineEmits<{ confirm: [sql: string]; cancel: [] }>()
const { t } = useI18n()

const statements = computed(() => (props.sql ? summarizeStatements(props.sql, props.dialect) : []))
const changes = computed(() => statements.value.some((s) => s.kind !== 'read'))
const risks = computed(() => (props.sql ? assessScript(props.sql, props.dialect) : []))
const riskOf = computed(() => new Map(risks.value.map((r) => [r.index, r])))
const danger = computed(() => risks.value.some((r) => r.level === 'danger'))
const ui = useUiStore()
/**
 * The name is typed when something destructive runs (unless the "double check" setting is off),
 * and always for anything that changes a prod database.
 */
const needsName = computed(() => !!props.connectionName && ((danger.value && ui.doubleCheck) || (props.prod && changes.value)))
const typed = ref('')
const nameMatches = computed(() => !needsName.value || typed.value.trim() === props.connectionName)
watch(
  () => props.sql,
  () => (typed.value = ''),
)

const tone: Record<StatementKind, 'success' | 'warning' | 'danger' | 'neutral'> = {
  read: 'success',
  write: 'warning',
  ddl: 'danger',
  other: 'neutral',
}

const riskText = (r: StatementRisk) =>
  t(`query.risk.${r.kind}`, { target: r.target ?? '', object: r.object ? t(`query.risk.objects.${r.object.replace(' ', '_')}`, r.object) : '' })

function confirm(): void {
  if (props.sql && nameMatches.value) emit('confirm', props.sql)
}
</script>

<template>
  <UiDialog
    :open="sql !== null"
    :title="danger ? t('query.risk.title') : t('query.alert.title')"
    :description="t('query.alert.description', { count: statements.length })"
    @update:open="(v) => !v && emit('cancel')"
  >
    <div
      v-if="risks.length"
      class="mb-3 flex gap-2 rounded-md border p-2 text-xs"
      :class="danger ? 'border-danger/50 bg-danger-soft text-danger' : 'border-warning/50 bg-warning-soft text-warning'"
      role="alert"
      data-run-risks
    >
      <Icon name="lucide:triangle-alert" class="mt-0.5 size-4 shrink-0" />
      <div class="grid gap-1">
        <p class="font-medium">{{ danger ? t('query.risk.heading') : t('query.risk.headingWarning') }}</p>
        <ul class="grid gap-0.5">
          <li v-for="r in risks" :key="r.index" :data-risk="r.kind">{{ riskText(r) }}</li>
        </ul>
        <p v-if="danger">{{ t('query.risk.noUndo') }}</p>
      </div>
    </div>
    <ol class="flex max-h-80 flex-col gap-2 overflow-x-hidden overflow-y-auto" data-run-confirm>
      <li
        v-for="(s, i) in statements"
        :key="i"
        class="min-w-0 shrink-0 rounded-md border bg-bg-subtle"
        :class="riskOf.get(i)?.level === 'danger' ? 'border-danger/60' : 'border-border'"
        :data-kind="s.kind"
      >
        <div class="flex items-center gap-2 border-b border-border px-2 py-1 text-xs">
          <span class="font-data shrink-0 text-fg-subtle">{{ i + 1 }}</span>
          <UiBadge class="shrink-0" :tone="tone[s.kind]">{{ t(`query.alert.kinds.${s.kind}.label`) }}</UiBadge>
          <span class="min-w-0 text-fg-muted">{{ t(`query.alert.kinds.${s.kind}.text`, { verb: s.verb ?? '' }) }}</span>
          <Icon v-if="riskOf.get(i)" name="lucide:triangle-alert" class="ml-auto size-3.5 shrink-0" :class="riskOf.get(i)!.level === 'danger' ? 'text-danger' : 'text-warning'" />
        </div>
        <pre class="font-data max-h-32 overflow-auto p-2 text-xs break-all whitespace-pre-wrap text-fg">{{ s.sql }}</pre>
      </li>
    </ol>
    <p v-if="prod && changes" class="mt-2 flex items-center gap-1.5 text-xs text-danger">
      <Icon name="lucide:triangle-alert" class="size-3.5" />{{ t('query.confirmProd') }}
    </p>
    <label v-if="needsName" class="mt-3 grid gap-1 text-xs text-fg-muted">
      {{ t('query.risk.typeName', { name: connectionName }) }}
      <UiInput v-model="typed" mono :placeholder="connectionName ?? ''" autocomplete="off" data-autofocus data-run-confirm-name @keydown.enter="confirm" />
    </label>
    <template #footer>
      <UiButton @click="emit('cancel')">{{ t('common.cancel') }}</UiButton>
      <UiButton :variant="changes ? 'danger' : 'primary'" :disabled="!nameMatches" data-confirm-alert-run @click="confirm">
        <Icon name="lucide:play" class="size-3.5" />{{ t('query.run') }}
      </UiButton>
    </template>
  </UiDialog>
</template>
