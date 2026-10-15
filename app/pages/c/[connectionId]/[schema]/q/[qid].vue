<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import type { ExplainResponse } from '#shared/types/explain'
import type { QueryResponse, StatementResult } from '#shared/types/query'
import type { SavedQuery } from '#shared/types/saved-queries'
import { resultColumn } from '#shared/result-columns'
import { formatResult, type ExportFormat } from '#shared/export-format'
import { useSchemaStore } from '~/stores/schema'
import { useQueriesStore } from '~/stores/queries'
import SqlEditor from '~/components/query/SqlEditor.vue'
import PlanTree from '~/components/query/PlanTree.vue'
import QuerySidePanel from '~/components/query/QuerySidePanel.vue'
import ResultGrid from '~/components/query/ResultGrid.vue'

const route = useRoute()
const id = route.params.connectionId as string
const schemaName = route.params.schema as string
const qid = route.params.qid as string
const { t } = useI18n()
const { number } = useFormat()
const toast = useToast()
const store = useSchemaStore()
const queries = useQueriesStore()
queries.hydrate()
const draft = queries.ensure(qid)

const { data: view } = await useFetch<ConnectionView>(`/api/connections/${id}`, { key: `connection-${id}` })
await store.ensure(id, schemaName).catch(() => {})

const envText: Record<ConnectionView['environment'], string> = {
  local: 'text-env-local',
  staging: 'text-env-staging',
  prod: 'text-env-prod',
}
const dialect = computed(() => (view.value?.dialect ?? store.dialect ?? 'postgres') as 'postgres' | 'mysql' | 'sqlite')
const readonly = computed(() => !!view.value && (view.value.readonly || view.value.readonlyGlobal))

const editor = ref<InstanceType<typeof SqlEditor> | null>(null)
const sidePanel = ref<InstanceType<typeof QuerySidePanel> | null>(null)
const showPanel = ref(true)

// ---- running -----------------------------------------------------------------------------------
const result = ref<QueryResponse | null>(null)
const running = ref(false)
const queryId = ref<string | null>(null)
const failure = ref<string | null>(null)
const errorLine = ref<number | null>(null)
const activeTab = ref<number | 'plan'>(0)
const lastRun = ref<{ sql: string; limit: number } | null>(null)
const pendingConfirm = ref<{ sql: string; kinds: string[] } | null>(null)

const newQueryId = () => `q${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`

function lineOfError(message: string, sql: string): number | null {
  const m = /\bline (\d+)/i.exec(message)
  if (!m) return null
  const start = draft.sql.indexOf(sql)
  const offset = start > 0 ? draft.sql.slice(0, start).split('\n').length - 1 : 0
  return Number(m[1]) + offset
}

async function execute(sql: string, confirmWrites = false): Promise<void> {
  if (!sql.trim() || running.value) return
  running.value = true
  failure.value = null
  errorLine.value = null
  queryId.value = newQueryId()
  const limit = queries.limit
  try {
    const res = await $fetch<QueryResponse>(`/api/c/${id}/query`, {
      method: 'POST',
      body: {
        sql,
        schema: schemaName,
        limit,
        timeoutMs: queries.timeoutMs,
        queryId: queryId.value,
        confirmWrites: confirmWrites || undefined,
      },
    })
    result.value = res
    lastRun.value = { sql, limit }
    activeTab.value = Math.max(0, res.statements.findIndex((s) => s.status !== 'ok' && s.status !== 'skipped'))
    const bad = res.statements.find((s) => s.error)
    if (bad?.error) errorLine.value = lineOfError(bad.error.message, bad.sql)
    if (res.schemaInvalidated) await store.load(id, schemaName).catch(() => {})
  } catch (err) {
    const data = (err as { data?: { data?: { code?: string; kinds?: string[]; message?: string } } }).data?.data
    if (data?.code === 'confirmation_required') {
      pendingConfirm.value = { sql, kinds: data.kinds ?? [] }
    } else {
      failure.value =
        data?.message || (err as { data?: { statusMessage?: string } }).data?.statusMessage || t('errors.unknown')
    }
  } finally {
    running.value = false
    queryId.value = null
    void sidePanel.value?.refresh()
  }
}

async function cancel(): Promise<void> {
  if (!queryId.value) return
  await $fetch(`/api/c/${id}/query/${queryId.value}/cancel`, { method: 'POST' }).catch(() => {})
}

const runCurrent = (sql?: string) => execute(sql ?? editor.value?.currentSql() ?? draft.sql)
const runAll = () => execute(draft.sql)

// ---- explain -----------------------------------------------------------------------------------
const plan = ref<ExplainResponse | null>(null)
const explaining = ref(false)
const planView = ref<'tree' | 'raw'>('tree')
const confirmAnalyze = ref(false)

async function explain(analyze: boolean): Promise<void> {
  const sql = editor.value?.currentSql() ?? draft.sql
  if (!sql.trim()) return
  explaining.value = true
  failure.value = null
  try {
    plan.value = await $fetch<ExplainResponse>(`/api/c/${id}/explain`, {
      method: 'POST',
      body: { sql, schema: schemaName, analyze },
    })
    activeTab.value = 'plan'
  } catch (err) {
    const d = (err as { data?: { data?: { message?: string }; statusMessage?: string } }).data
    failure.value = d?.data?.message || d?.statusMessage || t('errors.unknown')
  } finally {
    explaining.value = false
  }
}
const planTotal = computed(() => {
  const root = plan.value?.plan
  return root ? (root.timeMs ?? root.cost) : null
})

// ---- results -----------------------------------------------------------------------------------
const asColumn = resultColumn

const current = computed<StatementResult | null>(() =>
  typeof activeTab.value === 'number' ? (result.value?.statements[activeTab.value] ?? null) : null,
)
const currentColumns = computed(() => (current.value?.columns ?? []).map(asColumn))
const tabLabel = (s: StatementResult) => `${s.index + 1} · ${s.sql.replace(/\s+/g, ' ').slice(0, 22)}`
const statusTone = (s: StatementResult) => (s.status === 'ok' ? 'text-success' : s.status === 'skipped' ? 'text-fg-subtle' : 'text-danger')

function exportCurrent(format: ExportFormat): void {
  const s = current.value
  if (!s) return
  const text = formatResult(format, s.columns.map((c) => c.name), s.rows)
  saveBlob(new Blob([text], { type: format === 'csv' ? 'text/csv' : 'application/json' }), `query-${s.index + 1}.${format}`)
}
async function exportAll(format: ExportFormat): Promise<void> {
  const s = current.value
  if (!s) return
  try {
    await downloadFrom(`/api/c/${id}/export`, { sql: s.sql, schema: schemaName, format }, `query.${format}`)
  } catch {
    toast.push({ kind: 'error', title: t('query.exportFailed') })
  }
}
const exportMenu = computed(() => [
  { label: t('query.exportCsv'), icon: 'lucide:file-spreadsheet', onSelect: () => exportCurrent('csv') },
  { label: t('query.exportJson'), icon: 'lucide:file-json', onSelect: () => exportCurrent('json') },
  { label: '', separator: true },
  { label: t('query.exportAllCsv'), icon: 'lucide:download', onSelect: () => void exportAll('csv') },
  { label: t('query.exportAllJson'), icon: 'lucide:download', onSelect: () => void exportAll('json') },
])

// ---- saving ------------------------------------------------------------------------------------
const saveOpen = ref(false)
const saveName = ref('')
const saveGlobal = ref(false)

async function save(): Promise<void> {
  if (!draft.sql.trim()) return
  if (draft.savedId) {
    await $fetch<SavedQuery>(`/api/saved-queries/${draft.savedId}`, { method: 'PATCH', body: { sql: draft.sql } })
    draft.savedSql = draft.sql
    toast.push({ kind: 'success', title: t('query.saved') })
    void sidePanel.value?.refresh()
  } else {
    saveName.value = draft.name
    saveOpen.value = true
  }
}
async function confirmSave(): Promise<void> {
  const name = saveName.value.trim()
  if (!name) return
  const created = await $fetch<SavedQuery>('/api/saved-queries', {
    method: 'POST',
    body: { name, sql: draft.sql, connectionId: saveGlobal.value ? null : id },
  })
  Object.assign(draft, { savedId: created.id, name: created.name, savedSql: created.sql })
  saveOpen.value = false
  toast.push({ kind: 'success', title: t('query.saved') })
  void sidePanel.value?.refresh()
}

async function openFromPanel(p: { sql: string; savedId?: string; name?: string }, run = false): Promise<void> {
  // A saved query or history entry opens in the current tab when it is empty, otherwise in a new one.
  // With `run`, the statement executes in the tab where it ends up, so its result is the one on screen.
  if (!draft.sql.trim()) {
    Object.assign(draft, { sql: p.sql, savedId: p.savedId ?? null, name: p.name ?? '', savedSql: p.savedId ? p.sql : null })
    if (run) void runCurrent(p.sql)
    return
  }
  const newId = queries.create({ sql: p.sql, savedId: p.savedId ?? null, name: p.name ?? '', savedSql: p.savedId ? p.sql : null })
  await navigateTo({ path: `/c/${id}/${encodeURIComponent(schemaName)}/q/${newId}`, query: run ? { run: '1' } : undefined })
}

// A tab opened by "Run again" runs its statement once it is mounted, then drops the flag from the URL.
onMounted(() => {
  if (route.query.run !== '1') return
  void navigateTo({ path: route.path, query: {} }, { replace: true })
  if (draft.sql.trim()) void runCurrent(draft.sql)
})

// ---- layout: editor / results split ------------------------------------------------------------
const split = ref(45)
const root = ref<HTMLElement | null>(null)
const dragging = ref(false)
function onMove(e: PointerEvent) {
  if (!dragging.value || !root.value) return
  const box = root.value.getBoundingClientRect()
  split.value = Math.min(80, Math.max(15, ((e.clientY - box.top) / box.height) * 100))
}

const settingsOpen = ref(false)
const limitText = computed({ get: () => String(queries.limit), set: (v) => (queries.limit = Math.max(1, Math.min(100_000, Math.floor(Number(v)) || 1000))) })
const timeoutText = computed({
  get: () => String(Math.round(queries.timeoutMs / 1000)),
  set: (v) => (queries.timeoutMs = Math.max(1, Math.min(600, Math.floor(Number(v)) || 30)) * 1000),
})

</script>

<template>
  <div class="flex h-full min-h-0">
    <div ref="root" class="flex h-full min-h-0 min-w-0 flex-1 flex-col" @pointermove="onMove" @pointerup="dragging = false">
      <div v-if="view" class="h-0.5 shrink-0" :class="{ 'bg-env-local': view.environment === 'local', 'bg-env-staging': view.environment === 'staging', 'bg-env-prod': view.environment === 'prod' }" aria-hidden="true" />
      <header class="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
        <h1 class="max-w-48 truncate text-sm font-semibold text-fg">{{ draft.name || t('query.untitled') }}<span v-if="queries.isModified(draft)" class="text-warning"> •</span></h1>
        <span v-if="view" class="font-data text-xs font-medium uppercase" :class="envText[view.environment]">{{ view.environment }}</span>
        <UiBadge v-if="readonly" tone="warning">{{ t('shell.status.readonly') }}</UiBadge>

        <div class="ml-3 flex items-center gap-1">
          <UiButton v-if="!running" size="sm" variant="primary" data-run @click="runCurrent()">
            <Icon name="lucide:play" class="size-3.5" />{{ t('query.run') }}
            <UiKbd>⌘↵</UiKbd>
          </UiButton>
          <UiButton v-else size="sm" variant="danger" data-cancel @click="cancel">
            <Icon name="lucide:square" class="size-3.5" />{{ t('query.cancel') }}
          </UiButton>
          <UiButton size="sm" :disabled="running" data-run-all @click="runAll">{{ t('query.runAll') }}<UiKbd>⌘⇧↵</UiKbd></UiButton>
          <UiButton size="sm" :loading="explaining" :disabled="running" data-explain @click="explain(false)">{{ t('query.explain.run') }}</UiButton>
          <UiButton v-if="dialect !== 'sqlite'" size="sm" :disabled="running || explaining" data-explain-analyze @click="confirmAnalyze = true">
            {{ t('query.explain.analyze') }}
          </UiButton>
          <UiButton size="sm" variant="ghost" @click="editor?.format()">{{ t('query.format') }}</UiButton>
        </div>

        <div class="ml-auto flex items-center gap-1">
          <UiButton size="sm" data-save @click="save"><Icon name="lucide:save" class="size-3.5" />{{ t('common.save') }}</UiButton>
          <UiPopover v-model:open="settingsOpen">
            <template #trigger><UiIconButton icon="lucide:settings-2" :label="t('query.settings')" size="sm" /></template>
            <div class="grid w-56 gap-2">
              <label class="grid gap-1 text-xs text-fg-muted">{{ t('query.rowLimit') }}<UiInput v-model="limitText" type="number" mono /></label>
              <label class="grid gap-1 text-xs text-fg-muted">{{ t('query.timeoutSeconds') }}<UiInput v-model="timeoutText" type="number" mono /></label>
            </div>
          </UiPopover>
          <UiIconButton icon="lucide:panel-right" :label="t('query.togglePanel')" size="sm" @click="showPanel = !showPanel" />
        </div>
      </header>

      <div class="min-h-0" :style="{ height: `${split}%` }">
        <ClientOnly>
          <SqlEditor
            ref="editor"
            v-model="draft.sql"
            :dialect="dialect"
            :snapshot="store.snapshot"
            :graph="store.graph"
            :error-line="errorLine"
            @run="runCurrent"
            @run-all="runAll"
            @save="save"
          />
        </ClientOnly>
      </div>
      <div
        class="h-1 shrink-0 cursor-row-resize border-y border-border bg-bg-subtle hover:bg-accent/40"
        role="separator"
        :aria-label="t('query.resize')"
        @pointerdown="(e) => { dragging = true; (e.target as HTMLElement).setPointerCapture(e.pointerId) }"
      />

      <section class="flex min-h-0 flex-1 flex-col" data-results>
        <div v-if="result || plan" class="flex items-center gap-1 overflow-x-auto border-b border-border px-2">
          <button
            v-for="s in result?.statements ?? []"
            :key="s.index"
            type="button"
            class="font-data -mb-px h-7 shrink-0 border-b-2 px-2 text-xs"
            :class="[activeTab === s.index ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg', statusTone(s)]"
            data-result-tab
            @click="activeTab = s.index"
          >
            {{ tabLabel(s) }}
          </button>
          <button
            v-if="plan"
            type="button"
            class="-mb-px h-7 shrink-0 border-b-2 px-2 text-xs"
            :class="activeTab === 'plan' ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'"
            data-plan-tab
            @click="activeTab = 'plan'"
          >
            {{ plan.analyzed ? t('query.explain.analyze') : t('query.explain.run') }}
          </button>
        </div>

        <div v-if="failure" class="m-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger" role="alert" data-error>
          {{ failure }}
        </div>

        <div v-if="!result && !plan && !failure" class="flex flex-1 items-center justify-center p-4">
          <UiEmptyState icon="lucide:terminal" :title="t('query.emptyTitle')" :description="t('query.emptyHint')" />
        </div>

        <!-- Explain plan -->
        <div v-else-if="activeTab === 'plan' && plan" class="min-h-0 flex-1 overflow-auto p-2" data-plan>
          <div class="mb-2 flex items-center gap-2 text-xs text-fg-muted">
            <button type="button" class="rounded-sm px-2 py-0.5" :class="planView === 'tree' ? 'bg-surface text-fg' : ''" @click="planView = 'tree'">{{ t('query.explain.tree') }}</button>
            <button type="button" class="rounded-sm px-2 py-0.5" :class="planView === 'raw' ? 'bg-surface text-fg' : ''" @click="planView = 'raw'">{{ t('query.explain.raw') }}</button>
            <span class="font-data ml-auto">{{ plan.durationMs }} ms</span>
          </div>
          <p v-if="plan.analyzed" class="mb-2 text-xs text-warning">{{ t('query.explain.analyzeWarning') }}</p>
          <PlanTree v-if="planView === 'tree' && plan.plan" :node="plan.plan" :total="planTotal" />
          <p v-else-if="planView === 'tree'" class="text-sm text-fg-muted">{{ t('query.explain.unparsed') }}</p>
          <pre v-if="planView === 'raw' || !plan.plan" class="font-data overflow-auto rounded-md border border-border bg-bg-subtle p-2 text-xs text-fg">{{ plan.raw }}</pre>
        </div>

        <!-- One result set -->
        <template v-else-if="current">
          <div v-if="current.status === 'ok' && current.columns.length > 0" class="min-h-0 flex-1">
            <ResultGrid
              :key="`${result?.queryId}-${current.index}`"
              :connection-id="id"
              :schema="schemaName"
              :dialect="dialect"
              :sql="current.sql"
              :columns="currentColumns"
              :rows="current.rows"
            />
          </div>
          <div v-else-if="current.status === 'ok'" class="p-4 text-sm text-fg-muted" data-write-result>
            {{ current.affectedRows !== null ? t('query.affected', { count: current.affectedRows }) : t('query.done') }}
          </div>
          <div v-else-if="current.status === 'skipped'" class="p-4 text-sm text-fg-subtle">{{ t('query.skipped') }}</div>
          <div v-else class="m-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger" role="alert" data-error>
            <p class="font-data whitespace-pre-wrap break-words">{{ current.error?.message }}</p>
          </div>

          <footer class="flex items-center gap-3 border-t border-border px-3 py-1 text-xs text-fg-muted" data-status-bar>
            <span class="font-data">{{ current.durationMs }} ms</span>
            <span class="font-data">{{ t('query.rows', { count: number(current.rowCount) }) }}</span>
            <span v-if="current.truncated" class="text-warning" data-truncated>
              {{ t('query.truncated', { count: number(lastRun?.limit ?? queries.limit) }) }}
            </span>
            <span v-for="n in current.notices" :key="n" class="truncate text-fg-subtle">{{ n }}</span>
            <UiDropdownMenu v-if="current.status === 'ok' && current.columns.length > 0" :items="exportMenu">
              <button type="button" class="ml-auto inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 hover:bg-surface hover:text-fg" data-export-result>
                <Icon name="lucide:download" class="size-3" />{{ t('query.export') }}
              </button>
            </UiDropdownMenu>
          </footer>
        </template>
      </section>
    </div>

    <QuerySidePanel
      v-if="showPanel"
      ref="sidePanel"
      :connection-id="id"
      :active-saved-id="draft.savedId"
      @open="openFromPanel"
      @rerun="(sql) => openFromPanel({ sql }, true)"
    />

    <UiDialog :open="!!pendingConfirm" :title="t('query.confirmTitle')" :description="t('query.confirmProd')" @update:open="(v) => !v && (pendingConfirm = null)">
      <pre class="font-data max-h-48 overflow-auto rounded-md border border-border bg-bg-subtle p-2 text-xs">{{ pendingConfirm?.sql }}</pre>
      <template #footer>
        <UiButton @click="pendingConfirm = null">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="danger" data-confirm-run @click="() => { const p = pendingConfirm; pendingConfirm = null; if (p) void execute(p.sql, true) }">
          {{ t('query.runAnyway') }}
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="confirmAnalyze" :title="t('query.explain.analyze')" :description="t('query.explain.analyzeWarning')">
      <template #footer>
        <UiButton @click="confirmAnalyze = false">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="primary" @click="() => { confirmAnalyze = false; void explain(true) }">{{ t('query.explain.analyze') }}</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="saveOpen" :title="t('query.saveTitle')">
      <div class="grid gap-3">
        <UiInput v-model="saveName" :placeholder="t('query.namePlaceholder')" :aria-label="t('common.name')" @keydown.enter="confirmSave" />
        <UiCheckbox v-model="saveGlobal" :label="t('query.saveGlobal')" />
      </div>
      <template #footer>
        <UiButton @click="saveOpen = false">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="primary" :disabled="!saveName.trim()" data-confirm-save @click="confirmSave">{{ t('common.save') }}</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
