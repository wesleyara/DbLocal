<script setup lang="ts">
import type { ConnectionView } from '#shared/types/connection'
import type { QueryResponse } from '#shared/types/query'
import type { DbRoutine, DbTrigger } from '#shared/types/routines'
import { createTemplate, dropSql, editScript, supportedKinds, toggleTriggerSql, type NewKind } from '#shared/routine-sql'
import { useQueriesStore } from '~/stores/queries'
import { useRoutinesStore } from '~/stores/routines'
import { useSchemaStore } from '~/stores/schema'
import RunConfirmDialog from '~/components/query/RunConfirmDialog.vue'
import SqlEditor from '~/components/query/SqlEditor.vue'

/** Functions, procedures and triggers of a schema: browse, read the definition, create, edit, delete. */
const route = useRoute()
const router = useRouter()
const id = route.params.connectionId as string
const schemaName = route.params.schema as string
const { t } = useI18n()
const toast = useToast()
const queries = useQueriesStore()
const schemaStore = useSchemaStore()
const routinesStore = useRoutinesStore()

const { data: view } = await useFetch<ConnectionView>(`/api/connections/${id}`, { key: `connection-${id}` })
const data = computed(() => routinesStore.data)
const error = computed(() => routinesStore.error)
const status = computed(() => (routinesStore.loading ? 'pending' : 'success'))
const refresh = () => routinesStore.load(id, schemaName)
onMounted(() => void routinesStore.ensure(id, schemaName))
void schemaStore.ensure(id, schemaName).catch(() => {})

const dialect = computed(() => data.value?.dialect ?? view.value?.dialect ?? 'postgres')
const readonly = computed(() => !!view.value && (view.value.readonly || view.value.readonlyGlobal))
const loaded = computed(() => routinesStore.loaded)

type Item = { key: string; type: 'function' | 'procedure' | 'trigger'; name: string; routine?: DbRoutine; trigger?: DbTrigger }
const items = computed<Item[]>(() => [
  ...(data.value?.routines ?? []).map((r): Item => ({ key: r.signature, type: r.kind, name: r.name, routine: r })),
  ...(data.value?.triggers ?? []).map((tr): Item => ({ key: `${tr.table}.${tr.name}`, type: 'trigger', name: tr.name, trigger: tr })),
])

// ---- list ------------------------------------------------------------------------------------
const filter = ref<Item['type'][]>([])
const search = ref('')
const counts = computed(() => ({
  all: items.value.length,
  function: items.value.filter((i) => i.type === 'function').length,
  procedure: items.value.filter((i) => i.type === 'procedure').length,
  trigger: items.value.filter((i) => i.type === 'trigger').length,
}))
const filters = computed(() =>
  (['function', 'procedure', 'trigger'] as const)
    .filter((f) => f === 'trigger' || dialect.value !== 'sqlite')
    .map((f) => ({ value: f, label: `${t(`routines.filters.${f}`)} ${counts.value[f]}` })),
)
const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value.filter((i) => {
    if (filter.value.length && !filter.value.includes(i.type)) return false
    if (!q) return true
    return `${i.name} ${i.trigger?.table ?? ''} ${i.routine?.signature ?? ''}`.toLowerCase().includes(q)
  })
})
const groups = computed(() => {
  const order: Item['type'][] = ['function', 'procedure', 'trigger']
  return order.map((type) => ({ type, rows: visible.value.filter((i) => i.type === type) })).filter((g) => g.rows.length)
})

const editing = ref(false)
const creating = ref<NewKind | null>(null)
/** Writing a new object or editing one: the other "New ..." buttons wait until it is saved or cancelled. */
const busy = computed(() => editing.value || creating.value !== null)

// ---- selection (in the URL, so a link opens the same object) ---------------------------------
const selectedKey = computed(() => (typeof route.query.sel === 'string' ? route.query.sel : null))
const selected = computed(() => items.value.find((i) => i.key === selectedKey.value) ?? null)
async function select(item: Item | null): Promise<void> {
  if ((editing.value || creating.value) && !(await leaveEditing())) return
  void router.replace({ query: { ...route.query, sel: item?.key } })
}
watch(
  () => [loaded.value, items.value.length] as const,
  () => {
    if (loaded.value && !selected.value && items.value.length && !creating.value) {
      void router.replace({ query: { ...route.query, sel: items.value[0]!.key } })
    }
  },
  { immediate: true },
)

// ---- editor ----------------------------------------------------------------------------------
const newTable = ref('')
const draft = ref('')
const original = computed(() => selected.value?.routine ?? selected.value?.trigger ?? null)
const dirty = computed(() => (editing.value ? draft.value !== original.value?.definition : creating.value !== null))
const shownText = computed(() => draft.value)
// The editor always shows `draft`: the definition of the selection while reading, the text being typed otherwise.
watch(
  () => [original.value?.definition, editing.value, creating.value] as const,
  ([definition]) => {
    if (!editing.value && !creating.value) draft.value = definition ?? ''
  },
  { immediate: true },
)
const tableOptions = computed(() => schemaStore.tables.map((tb) => ({ value: tb.name, label: tb.name })))

// Leaving unsaved text asks in an in-app dialog (never the browser's `confirm`).
const discardAsk = ref<((ok: boolean) => void) | null>(null)
function askDiscard(): Promise<boolean> {
  return new Promise((resolve) => (discardAsk.value = resolve))
}
function answerDiscard(ok: boolean): void {
  discardAsk.value?.(ok)
  discardAsk.value = null
}
async function leaveEditing(): Promise<boolean> {
  if (dirty.value && !(await askDiscard())) return false
  editing.value = false
  creating.value = null
  return true
}
function startEdit(): void {
  if (!original.value) return
  draft.value = original.value.definition
  editing.value = true
}
async function startCreate(kind: NewKind): Promise<void> {
  if (creating.value === kind) return
  if ((editing.value || creating.value) && !(await leaveEditing())) return
  if (kind === 'trigger') newTable.value ||= tableOptions.value[0]?.value ?? ''
  creating.value = kind
  editing.value = false
  draft.value = createTemplate(dialect.value, schemaName, kind, newTable.value || undefined)
}
watch(newTable, (table) => {
  if (creating.value === 'trigger') draft.value = createTemplate(dialect.value, schemaName, 'trigger', table || undefined)
})
async function cancelEdit(): Promise<void> {
  await leaveEditing()
}

// ---- running the DDL (through the SQL endpoint: read-only, prod and history guards apply) ----
const pendingSql = ref<string | null>(null)
const running = ref(false)
const failure = ref<string | null>(null)

function review(sql: string): void {
  failure.value = null
  pendingSql.value = sql
}
function reviewSave(): void {
  if (creating.value) return review(draft.value)
  if (original.value) review(editScript(dialect.value, schemaName, original.value, draft.value))
}
function reviewDelete(): void {
  if (original.value) review(dropSql(dialect.value, schemaName, original.value))
}
function reviewToggle(): void {
  const tr = selected.value?.trigger
  if (tr) review(toggleTriggerSql(schemaName, tr, !tr.enabled))
}

async function runPending(sql: string): Promise<void> {
  pendingSql.value = null
  running.value = true
  failure.value = null
  try {
    const res = await $fetch<QueryResponse>(`/api/c/${id}/query`, {
      method: 'POST',
      body: { sql, schema: schemaName, confirmWrites: true, queryId: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` },
    })
    const failed = res.statements.find((s) => s.status !== 'ok')
    if (failed) {
      failure.value = failed.error?.message ?? failed.status
      return
    }
    const wasCreating = creating.value !== null
    editing.value = false
    creating.value = null
    toast.push({ kind: 'success', title: t('routines.saved') })
    await refresh()
    if (wasCreating || !selected.value) await router.replace({ query: { ...route.query, sel: items.value[0]?.key } })
    void schemaStore.load(id, schemaName, true).catch(() => {})
  } catch (err) {
    failure.value = (err as { data?: { message?: string }; message?: string }).data?.message ?? (err as Error).message
  } finally {
    running.value = false
  }
}

// ---- small actions ---------------------------------------------------------------------------
async function copy(): Promise<void> {
  await navigator.clipboard.writeText(shownText.value)
  toast.push({ kind: 'success', title: t('routines.copied') })
}
function openInEditor(): void {
  const qid = queries.create({ sql: shownText.value, name: selected.value?.name })
  void navigateTo(`/c/${id}/${encodeURIComponent(schemaName)}/q/${qid}`)
}
function openTable(table: string): void {
  void navigateTo(`/c/${id}/${encodeURIComponent(schemaName)}/t/${encodeURIComponent(table)}`)
}

const icon = { function: 'lucide:square-function', procedure: 'lucide:square-terminal', trigger: 'lucide:zap' } as const
const newKinds = computed(() => supportedKinds(dialect.value))
const triggerLabel = (tr: DbTrigger) => `${tr.timing} ${tr.events.join(' / ')}`

watch(dirty, (value) => {
  if (!import.meta.client) return
  const tab = useWorkspaceStore().forConnection(id).find((x) => x.type === 'routines' && x.schema === schemaName)
  if (tab) tab.dirty = value
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-routines>
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
      <h1 class="truncate text-sm font-semibold text-fg">{{ t('routines.title') }}</h1>
      <span class="text-xs text-fg-subtle">{{ schemaName }}</span>
      <HelpHint id="routines.overview" />
      <UiBadge v-if="readonly" tone="warning">{{ t('shell.status.readonly') }}</UiBadge>
      <div class="ml-auto flex items-center gap-1.5">
        <UiButton size="sm" data-routines-refresh @click="refresh()">
          <Icon name="lucide:refresh-cw" class="size-3.5" :class="status === 'pending' && 'animate-spin'" />{{ t('routines.refresh') }}
        </UiButton>
        <template v-if="!readonly">
          <UiButton
            v-for="k in newKinds"
            :key="k"
            size="sm"
            :variant="creating === k ? 'primary' : undefined"
            :disabled="busy && creating !== k"
            :data-new-routine="k"
            @click="startCreate(k)"
          >
            <Icon name="lucide:plus" class="size-3.5" />{{ t(`routines.new.${k}`) }}
          </UiButton>
        </template>
      </div>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-[minmax(14rem,20rem)_1fr]">
      <!-- list -->
      <aside class="flex min-h-0 flex-col border-r border-border" data-routines-list>
        <div class="flex flex-col gap-2 border-b border-border p-2">
          <UiInput v-model="search" :placeholder="t('routines.search')" :aria-label="t('routines.search')" data-routines-search />
          <UiMultiCombobox
            v-model="filter"
            :options="filters"
            :placeholder="`${t('routines.filters.all')} ${counts.all}`"
            :empty-text="t('routines.noMatches')"
            data-routines-filter
          />
        </div>
        <div class="min-h-0 flex-1 overflow-auto p-1">
          <div v-if="!loaded" class="flex flex-col gap-1 p-1" data-routines-skeleton>
            <UiSkeleton v-for="n in 6" :key="n" class="h-9 w-full" />
          </div>
          <p v-else-if="error" class="p-3 text-sm text-danger">{{ error.message }}</p>
          <UiEmptyState
            v-else-if="!items.length"
            icon="lucide:square-function"
            :title="t('routines.empty.title')"
            :description="dialect === 'sqlite' ? t('routines.empty.sqlite') : t('routines.empty.description')"
          />
          <p v-else-if="!visible.length" class="p-3 text-sm text-fg-muted">{{ t('routines.noMatches') }}</p>
          <section v-for="g in groups" :key="g.type" class="mb-2">
            <h2 class="px-2 py-1 text-[11px] font-medium text-fg-subtle uppercase">{{ t(`routines.filters.${g.type}`) }} {{ g.rows.length }}</h2>
            <button
              v-for="item in g.rows"
              :key="item.key"
              type="button"
              class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface"
              :class="selected?.key === item.key && 'bg-surface'"
              :data-routine-item="item.key"
              @click="select(item)"
            >
              <Icon :name="icon[item.type]" class="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
              <span class="min-w-0 flex-1">
                <span class="font-data block truncate text-sm text-fg">{{ item.name }}</span>
                <span class="block truncate text-xs text-fg-subtle">
                  <template v-if="item.trigger">{{ item.trigger.table }} · {{ triggerLabel(item.trigger) }}</template>
                  <template v-else-if="item.routine">({{ item.routine.args }}){{ item.routine.returns ? ` → ${item.routine.returns}` : '' }}</template>
                </span>
              </span>
              <UiBadge v-if="item.trigger && !item.trigger.enabled" tone="warning">{{ t('routines.disabled') }}</UiBadge>
            </button>
          </section>
        </div>
      </aside>

      <!-- detail -->
      <section class="flex min-h-0 min-w-0 flex-col" data-routine-detail>
        <template v-if="creating || selected">
          <div class="flex flex-col gap-2 border-b border-border px-3 py-2">
            <div class="flex flex-wrap items-center gap-2">
              <Icon :name="icon[creating ?? selected!.type]" class="size-4 text-fg-muted" />
              <h2 class="font-data min-w-0 truncate text-sm font-semibold text-fg">
                {{ creating ? t(`routines.new.${creating}`) : selected!.routine?.signature ?? selected!.name }}
              </h2>
              <UiBadge v-if="selected?.routine?.language && !creating">{{ selected.routine.language }}</UiBadge>
              <UiBadge v-if="selected?.trigger && !creating" tone="accent">{{ triggerLabel(selected.trigger) }}</UiBadge>
              <UiBadge v-if="selected?.trigger && !creating">{{ selected.trigger.orientation === 'row' ? t('routines.forEachRow') : t('routines.forEachStatement') }}</UiBadge>
              <UiBadge v-if="selected?.trigger && !selected.trigger.enabled && !creating" tone="warning">{{ t('routines.disabled') }}</UiBadge>
            </div>
            <div v-if="!creating && selected" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
              <button v-if="selected.trigger" type="button" class="hover:text-accent" data-trigger-table @click="openTable(selected.trigger.table)">
                <Icon name="lucide:table-2" class="mr-1 inline size-3" />{{ selected.trigger.table }}
              </button>
              <span v-if="selected.trigger?.routine" class="font-data">{{ t('routines.calls') }} {{ selected.trigger.routine }}()</span>
              <span v-if="selected.routine?.returns" class="font-data">{{ t('routines.returns') }} {{ selected.routine.returns }}</span>
              <span v-if="selected.routine?.comment">{{ selected.routine.comment }}</span>
            </div>
            <div v-if="creating === 'trigger'" class="flex items-center gap-2 text-xs text-fg-muted">
              {{ t('routines.onTable') }}
              <UiSelect v-model="newTable" :options="tableOptions" :placeholder="t('routines.pickTable')" />
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <UiButton size="sm" data-routine-copy @click="copy"><Icon name="lucide:copy" class="size-3.5" />{{ t('routines.copy') }}</UiButton>
              <UiButton size="sm" data-routine-open-sql @click="openInEditor">
                <Icon name="lucide:terminal" class="size-3.5" />{{ t('routines.openInEditor') }}
              </UiButton>
              <template v-if="!readonly">
                <template v-if="editing || creating">
                  <UiButton size="sm" variant="primary" :loading="running" data-routine-save @click="reviewSave">
                    <Icon name="lucide:save" class="size-3.5" />{{ t('common.save') }}
                  </UiButton>
                  <UiButton size="sm" data-routine-cancel @click="cancelEdit">{{ t('common.cancel') }}</UiButton>
                </template>
                <template v-else>
                  <UiButton size="sm" data-routine-edit @click="startEdit"><Icon name="lucide:pencil" class="size-3.5" />{{ t('routines.edit') }}</UiButton>
                  <UiButton
                    v-if="selected?.trigger && dialect === 'postgres'"
                    size="sm"
                    data-routine-toggle
                    @click="reviewToggle"
                  >
                    <Icon :name="selected.trigger.enabled ? 'lucide:pause' : 'lucide:play'" class="size-3.5" />
                    {{ selected.trigger.enabled ? t('routines.disable') : t('routines.enable') }}
                  </UiButton>
                  <UiButton size="sm" variant="danger" data-routine-delete @click="reviewDelete">
                    <Icon name="lucide:trash-2" class="size-3.5" />{{ t('common.delete') }}
                  </UiButton>
                </template>
              </template>
            </div>
            <p v-if="failure" class="font-data rounded-md border border-danger/40 bg-danger-soft p-2 text-xs break-words whitespace-pre-wrap text-danger" data-routine-error>
              {{ failure }}
            </p>
            <p v-if="dialect === 'mysql' && editing" class="text-xs text-fg-subtle">{{ t('routines.mysqlNotAtomic') }}</p>
          </div>
          <div class="min-h-0 flex-1">
            <ClientOnly>
              <SqlEditor
                v-model="draft"
                class="h-full"
                :dialect="dialect"
                :snapshot="null"
                :graph="null"
                :read-only="!(editing || creating)"
                :data-editing="editing || !!creating"
                @save="reviewSave"
              />
            </ClientOnly>
          </div>
        </template>
        <UiEmptyState
          v-else-if="loaded"
          icon="lucide:square-function"
          :title="t('routines.pick.title')"
          :description="t('routines.pick.description')"
        />
      </section>
    </div>

    <UiDialog :open="!!discardAsk" :title="t('routines.discardTitle')" :description="t('routines.discardConfirm')" @update:open="(v) => !v && answerDiscard(false)">
      <template #footer>
        <UiButton data-discard-cancel @click="answerDiscard(false)">{{ t('routines.keepEditing') }}</UiButton>
        <UiButton variant="danger" data-discard-confirm @click="answerDiscard(true)">{{ t('routines.discard') }}</UiButton>
      </template>
    </UiDialog>

    <RunConfirmDialog
      :sql="pendingSql"
      :dialect="dialect"
      :prod="view?.environment === 'prod'"
      :connection-name="view?.name"
      @confirm="runPending"
      @cancel="pendingSql = null"
    />
  </div>
</template>
