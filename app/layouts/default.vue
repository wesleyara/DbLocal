<script setup lang="ts">
import type { PaletteAction } from '~/components/shell/CommandPalette.vue'
import type { ConnectionView } from '#shared/types/connection'
import type { MenuItem } from '~/components/ui/DropdownMenu.vue'
import { usePendingStore } from '~/stores/pending-changes'
import { useSchemaStore } from '~/stores/schema'
import { useTourStore } from '~/stores/tour'
const { t, locale, setLocale } = useI18n()
const ui = useUiStore()
const { format } = useShortcuts()
const route = useRoute()
const status = await useFetch('/api/auth/status')
const connectionId = computed(() => route.params.connectionId as string | undefined)
const schema = computed(() => route.params.schema as string | undefined)

const requestFetch = useRequestFetch() // forwards the session cookie during SSR
const { data: activeConnection } = await useAsyncData(
  'active-connection',
  () =>
    connectionId.value
      ? requestFetch<{ name: string; dialect: string; readonly: boolean }>(`/api/connections/${connectionId.value}`).catch(
          () => null,
        )
      : Promise.resolve(null),
  { watch: [connectionId] },
)

// The browser tab always reads "DbLocal - <connection>", whatever page is open.
useHead({
  htmlAttrs: { lang: () => locale.value },
  title: () => (activeConnection.value ? `${t('app.name')} - ${activeConnection.value.name}` : t('app.name')),
})

// ---- workspace tabs: the route is the source of truth, the store follows it --------------------
const workspace = useWorkspaceStore()
const queries = useQueriesStore()
const bar = ref<{ goBack: () => void; goForward: () => void; requestClose: (tab: never) => void } | null>(null)
const mounted = ref(false)

function syncWorkspace() {
  const id = connectionId.value
  const name = schema.value
  if (!id || !name) return
  const table = route.params.table as string | undefined
  const qid = route.params.qid as string | undefined
  if (qid) {
    workspace.sync(id, route.fullPath, {
      schema: name,
      type: 'query',
      title: queries.drafts[qid]?.name || t('query.untitled'),
      icon: 'lucide:terminal',
    })
    return
  }
  if (route.path.endsWith('/erd') && !table) {
    workspace.sync(id, route.fullPath, { schema: name, type: 'erd', title: t('erd.title'), icon: 'lucide:network' })
    return
  }
  if (route.path.endsWith('/routines') && !table) {
    workspace.sync(id, route.fullPath, { schema: name, type: 'routines', title: t('routines.title'), icon: 'lucide:square-function' })
    return
  }
  if (route.path.endsWith('/notes') && !table) {
    workspace.sync(id, route.fullPath, { schema: name, type: 'notes', title: t('notes.open'), icon: 'lucide:notebook-pen' })
    return
  }
  const recordOpen = typeof route.query.r === 'string'
  workspace.sync(id, route.fullPath, {
    schema: name,
    type: table ? (recordOpen ? 'record' : 'table') : 'table',
    title: table ?? name,
    icon: recordOpen ? 'lucide:panel-right' : table ? 'lucide:table-2' : 'lucide:database',
  })
}

function newQuery() {
  const id = connectionId.value
  const name = schema.value
  if (!id || !name) return
  const qid = queries.create()
  void navigateTo(`/c/${id}/${encodeURIComponent(name)}/q/${qid}`)
}

/** The diagram is one tab per schema: an open one is reused. */
function openErd() {
  const id = connectionId.value
  const name = schema.value
  if (!id || !name) return
  const path = `/c/${id}/${encodeURIComponent(name)}/erd`
  const existing = workspace.forConnection(id).find((tab) => tab.type === 'erd' && tab.schema === name)
  if (existing) {
    const target = workspace.activate(existing.id)
    if (target) return void navigateTo(target)
  }
  workspace.open(id, path, { schema: name, type: 'erd', title: t('erd.title'), icon: 'lucide:network' })
  void navigateTo(path)
}

/** Functions and triggers are one tab per schema: an open one is reused. */
function openRoutines() {
  const id = connectionId.value
  const name = schema.value
  if (!id || !name) return
  const path = `/c/${id}/${encodeURIComponent(name)}/routines`
  const existing = workspace.forConnection(id).find((tab) => tab.type === 'routines' && tab.schema === name)
  if (existing) {
    const target = workspace.activate(existing.id)
    if (target) return void navigateTo(target)
  }
  workspace.open(id, path, { schema: name, type: 'routines', title: t('routines.title'), icon: 'lucide:square-function' })
  void navigateTo(path)
}

/** Dump / restore of the open connection: its view is read when the dialog opens. */
const backup = ref<{ connection: ConnectionView; mode: 'dump' | 'restore' } | null>(null)
const backupOpen = (mode: 'dump' | 'restore') =>
  computed({
    get: () => backup.value?.mode === mode,
    set: (v: boolean) => !v && (backup.value = null),
  })
const dumpOpen = backupOpen('dump')
const restoreOpen = backupOpen('restore')
async function openBackup(mode: 'dump' | 'restore') {
  const id = connectionId.value
  if (!id) return
  backup.value = { connection: await $fetch<ConnectionView>(`/api/connections/${id}`), mode }
}

const moreItems = computed<MenuItem[]>(() => [
  { label: t('routines.open'), icon: 'lucide:square-function', onSelect: () => openRoutines() },
  { label: t('notes.open'), icon: 'lucide:notebook-pen', onSelect: () => openNotes() },
  { label: '', separator: true },
  { label: t('backup.dump.menu'), icon: 'lucide:download', onSelect: () => void openBackup('dump') },
  { label: t('backup.restore.menu'), icon: 'lucide:upload', onSelect: () => void openBackup('restore') },
])

/** Connection notes are one tab per connection (the note is the same in every schema): an open one is reused. */
function openNotes() {
  const id = connectionId.value
  const name = schema.value
  if (!id || !name) return
  const existing = workspace.forConnection(id).find((tab) => tab.type === 'notes')
  if (existing) {
    const target = workspace.activate(existing.id)
    if (target) return void navigateTo(target)
  }
  const path = `/c/${id}/${encodeURIComponent(name)}/notes`
  workspace.open(id, path, { schema: name, type: 'notes', title: t('notes.open'), icon: 'lucide:notebook-pen' })
  void navigateTo(path)
}

onMounted(() => {
  workspace.hydrate()
  queries.hydrate()
  tour.hydrate()
  mounted.value = true
  syncWorkspace()
  readResolved()
})
watch(() => ui.theme, () => nextTick(readResolved))
watch(
  () =>
    `${connectionId.value}|${schema.value}|${route.fullPath}|${queries.drafts[route.params.qid as string]?.name ?? ''}`,
  () => mounted.value && syncWorkspace(),
)

// ---- productivity: palette, global search, cheat sheet and the shortcut registry -----------------
const paletteOpen = ref(false)
const searchOpen = ref(false)
const newTableOpen = ref(false)
const cheatSheetOpen = ref(false)
const { openCentre } = useHelp()
const tour = useTourStore()
const settingsOpen = ref(false)
const pendingStore = usePendingStore()
const schemaStore = useSchemaStore()
const hasSchema = computed(() => !!connectionId.value && !!schema.value)

/** What is on screen now, so `system` still toggles to the opposite of what the user sees. */
const resolvedDark = ref(true)
function readResolved() {
  resolvedDark.value = document.documentElement.dataset.theme !== 'light'
}
const themeIcon = computed(() => (resolvedDark.value ? 'lucide:sun' : 'lucide:moon'))
function toggleTheme() {
  ui.theme = resolvedDark.value ? 'light' : 'dark'
  void nextTick(readResolved)
}
function toggleLocale() {
  void setLocale(locale.value === 'en' ? 'pt-BR' : 'en')
}
async function refreshSchema() {
  if (connectionId.value) await schemaStore.load(connectionId.value, schema.value ?? null, true)
}
async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
  await navigateTo('/login')
}
function stepTab(delta: 1 | -1) {
  const id = connectionId.value
  const next = id ? workspace.neighbour(id, delta) : null
  if (next) {
    workspace.activate(next.id)
    void navigateTo(next.path)
  }
}

const paletteActions = computed<PaletteAction[]>(() => {
  const list: PaletteAction[] = []
  if (hasSchema.value) {
    list.push(
      { id: 'new-query', label: t('palette.actions.newQuery'), icon: 'lucide:terminal', shortcut: 'nav.newQuery', run: newQuery },
      { id: 'routines', label: t('palette.actions.openRoutines'), icon: 'lucide:square-function', keywords: 'functions procedures triggers', run: openRoutines },
      { id: 'erd', label: t('palette.actions.openErd'), icon: 'lucide:network', keywords: 'diagram', run: openErd },
      { id: 'notes', label: t('palette.actions.openNotes'), icon: 'lucide:notebook-pen', keywords: 'notes notas markdown', run: openNotes },
      { id: 'dump', label: t('palette.actions.dump'), icon: 'lucide:download', keywords: 'backup dump export sql', run: () => void openBackup('dump') },
      { id: 'restore', label: t('palette.actions.restore'), icon: 'lucide:upload', keywords: 'restore import sql backup', run: () => void openBackup('restore') },
      { id: 'new-table', label: t('palette.actions.newTable'), icon: 'lucide:table-2', keywords: 'create table criar tabela', run: () => (newTableOpen.value = true) },
      { id: 'search', label: t('palette.actions.search'), icon: 'lucide:text-search', shortcut: 'global.search', run: () => (searchOpen.value = true) },
      { id: 'refresh', label: t('palette.actions.refreshSchema'), icon: 'lucide:refresh-cw', run: () => void refreshSchema() },
      { id: 'reload', label: t('palette.actions.reloadData'), icon: 'lucide:rotate-cw', shortcut: 'nav.reload', run: () => void pendingStore.version++ },
    )
  }
  list.push(
    { id: 'settings', label: t('settings.title'), icon: 'lucide:settings', run: () => (settingsOpen.value = true) },
    { id: 'theme', label: t('palette.actions.toggleTheme'), icon: 'lucide:sun-moon', keywords: 'dark light', run: toggleTheme },
    { id: 'locale', label: t('palette.actions.switchLanguage'), icon: 'lucide:languages', keywords: 'idioma english português', run: toggleLocale },
    { id: 'sidebar', label: t('shell.toggleSidebar'), icon: 'lucide:panel-left', shortcut: 'nav.sidebar', run: () => (ui.sidebarCollapsed = !ui.sidebarCollapsed) },
    { id: 'tour', label: t('tour.palette'), icon: 'lucide:route', keywords: 'tour guide onboarding demo ajuda', run: () => void tour.start() },
    { id: 'help', label: t('help.palette'), icon: 'lucide:circle-help', shortcut: 'global.help', keywords: 'help ajuda docs guide tour', run: () => void openCentre() },
    { id: 'shortcuts', label: t('palette.actions.shortcuts'), icon: 'lucide:keyboard', shortcut: 'global.shortcuts', run: () => (cheatSheetOpen.value = true) },
  )
  if (status.data.value?.authEnabled) {
    list.push({ id: 'signout', label: t('palette.actions.signOut'), icon: 'lucide:log-out', run: () => void signOut() })
  }
  return list
})

const inConnection = () => !!connectionId.value
useShortcutDispatcher()
useShortcutsRegistration([
  // global
  { id: 'global.palette', keys: 'mod+k', description: 'shortcuts.items.palette', context: 'global', allowInInput: true, run: () => (paletteOpen.value = !paletteOpen.value) },
  { id: 'global.search', keys: 'mod+shift+f', description: 'shortcuts.items.search', context: 'global', allowInInput: true, when: () => hasSchema.value, run: () => (searchOpen.value = true) },
  { id: 'global.help', keys: 'f1', description: 'shortcuts.items.help', context: 'global', allowInInput: true, run: () => void openCentre() },
  { id: 'global.shortcuts', keys: '?', description: 'shortcuts.items.cheatSheet', context: 'global', run: () => (cheatSheetOpen.value = true) },
  { id: 'global.save', keys: 'mod+s', description: 'shortcuts.items.save', context: 'global', allowInInput: true },
  // navigation
  { id: 'nav.back', keys: 'mod+[', description: 'shortcuts.items.back', context: 'navigation', when: inConnection, run: () => bar.value?.goBack() },
  { id: 'nav.forward', keys: 'mod+]', description: 'shortcuts.items.forward', context: 'navigation', when: inConnection, run: () => bar.value?.goForward() },
  { id: 'nav.prevTab', keys: 'mod+shift+[', description: 'shortcuts.items.prevTab', context: 'navigation', when: inConnection, run: () => stepTab(-1) },
  { id: 'nav.nextTab', keys: 'mod+shift+]', description: 'shortcuts.items.nextTab', context: 'navigation', when: inConnection, run: () => stepTab(1) },
  { id: 'nav.newQuery', keys: 'mod+t', description: 'shortcuts.items.newQuery', context: 'navigation', when: () => hasSchema.value, run: newQuery },
  {
    id: 'nav.closeTab',
    keys: 'mod+w',
    description: 'shortcuts.items.closeTab',
    context: 'navigation',
    when: () => !!connectionId.value && workspace.active?.connectionId === connectionId.value,
    run: () => bar.value?.requestClose(workspace.active as never),
  },
  { id: 'nav.sidebar', keys: 'mod+b', description: 'shortcuts.items.sidebar', context: 'navigation', run: () => (ui.sidebarCollapsed = !ui.sidebarCollapsed) },
  { id: 'nav.reload', keys: 'mod+r', description: 'shortcuts.items.reload', context: 'navigation', when: () => hasSchema.value, run: () => void pendingStore.version++ },
  // grid (handled by the grid itself; listed here so the cheat sheet is complete)
  { id: 'grid.move', keys: 'arrowdown', description: 'shortcuts.items.gridMove', context: 'grid' },
  { id: 'grid.extend', keys: 'shift+arrowdown', description: 'shortcuts.items.gridExtend', context: 'grid' },
  { id: 'grid.edges', keys: 'home', description: 'shortcuts.items.gridHome', context: 'grid' },
  { id: 'grid.end', keys: 'end', description: 'shortcuts.items.gridEnd', context: 'grid' },
  { id: 'grid.pageUp', keys: 'pageup', description: 'shortcuts.items.gridPageUp', context: 'grid' },
  { id: 'grid.pageDown', keys: 'pagedown', description: 'shortcuts.items.gridPageDown', context: 'grid' },
  { id: 'grid.edit', keys: 'enter', description: 'shortcuts.items.gridEdit', context: 'grid' },
  { id: 'grid.open', keys: 'space', description: 'shortcuts.items.gridOpen', context: 'grid' },
  { id: 'grid.copy', keys: 'mod+c', description: 'shortcuts.items.gridCopy', context: 'grid' },
  { id: 'grid.delete', keys: 'delete', description: 'shortcuts.items.gridDelete', context: 'grid' },
  { id: 'grid.undo', keys: 'mod+z', description: 'shortcuts.items.gridUndo', context: 'grid' },
  { id: 'grid.filter', keys: 'f', description: 'shortcuts.items.gridFilter', context: 'grid' },
  // editor
  { id: 'editor.run', keys: 'mod+enter', description: 'shortcuts.items.runStatement', context: 'editor', allowInInput: true },
  { id: 'editor.runAll', keys: 'mod+shift+enter', description: 'shortcuts.items.runAll', context: 'editor', allowInInput: true },
  { id: 'editor.format', keys: 'alt+shift+f', description: 'shortcuts.items.format', context: 'editor', allowInInput: true },
  { id: 'editor.acceptSuggestion', keys: 'arrowright', description: 'shortcuts.items.acceptSuggestion', context: 'editor', allowInInput: true },
  { id: 'editor.acceptWord', keys: 'alt+arrowright', description: 'shortcuts.items.acceptSuggestionWord', context: 'editor', allowInInput: true },
])

const dragging = ref(false)
function startResize(e: PointerEvent) {
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onResize(e: PointerEvent) {
  if (dragging.value) ui.setSidebarWidth(e.clientX)
}
</script>

<template>
  <div class="flex h-screen flex-col bg-bg text-fg">
    <div
      v-if="status.data.value?.exposedWithoutPassword"
      class="bg-warning-soft px-3 py-1 text-center text-xs text-warning"
      role="alert"
    >
      {{ t('access.exposedWarning') }}
    </div>

    <header class="relative flex h-11 shrink-0 items-center gap-2 border-b border-border bg-bg-subtle px-3">
      <UiIconButton
        v-if="connectionId"
        icon="lucide:panel-left"
        :label="t('shell.toggleSidebar')"
        @click="ui.sidebarCollapsed = !ui.sidebarCollapsed"
      />
      <NuxtLink to="/" :title="t('shell.home')" class="flex items-center gap-2 rounded-md pr-1 text-sm font-semibold hover:text-accent">
        <UiLogo class="size-6" />
        <span>{{ t('app.name') }}</span>
      </NuxtLink>
      <template v-if="connectionId && schema">
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <UiButton size="sm" data-new-query data-tour="new-query" @click="newQuery">
          <Icon name="lucide:terminal" class="size-3.5" />{{ t('query.new') }}
        </UiButton>
        <UiButton size="sm" data-open-erd @click="openErd">
          <Icon name="lucide:network" class="size-3.5" />{{ t('erd.open') }}
        </UiButton>
        <UiDropdownMenu :items="moreItems">
          <UiButton size="sm" data-open-more :aria-label="t('shell.more')">
            {{ t('shell.more') }}<Icon name="lucide:chevron-down" class="size-3.5" />
          </UiButton>
        </UiDropdownMenu>
      </template>
      <button
        type="button"
        class="absolute left-1/2 hidden h-8 w-[min(28rem,30vw)] -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-left text-sm text-fg-subtle hover:border-border-strong lg:flex"
        data-open-palette
        data-tour="palette"
        :aria-label="t('palette.title')"
        @click="paletteOpen = true"
      >
        <Icon name="lucide:search" class="size-3.5" />
        <span class="flex-1 truncate">{{ t('shell.search') }}</span>
        <span class="flex gap-0.5"><UiKbd v-for="part in format('mod+k')" :key="part">{{ part }}</UiKbd></span>
      </button>
      <div class="ml-auto flex items-center gap-1">
        <UiIconButton :icon="themeIcon" :label="t('shell.toggleTheme')" data-theme-toggle @click="toggleTheme" />
        <UiIconButton icon="lucide:circle-help" :label="t('help.open')" data-open-help @click="openCentre()" />
        <UiIconButton icon="lucide:keyboard" :label="t('shortcuts.title')" @click="cheatSheetOpen = true" />
        <UiIconButton icon="lucide:settings" :label="t('settings.title')" data-open-settings @click="settingsOpen = true" />
      </div>
    </header>

    <div class="flex min-h-0 flex-1" @pointermove="onResize" @pointerup="dragging = false">
      <aside
        v-if="connectionId && !ui.sidebarCollapsed"
        data-tour="sidebar"
        class="relative hidden shrink-0 flex-col border-r border-border bg-bg-subtle sm:flex"
        :style="{ width: `${ui.sidebarWidth}px` }"
      >
        <ConnectionsSchemaSelector
          v-if="connectionId"
          :key="connectionId"
          :connection-id="connectionId"
          :current="schema"
        />
        <SchemaTree
          v-if="connectionId"
          :key="connectionId"
          :connection-id="connectionId"
          :schema="schema"
          :can-create="!!schema && !activeConnection?.readonly"
          @new-table="newTableOpen = true"
        />
        <div
          class="absolute inset-y-0 -right-0.5 w-1 cursor-col-resize hover:bg-accent/50"
          role="separator"
          aria-orientation="vertical"
          @pointerdown="startResize"
        />
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <WorkspaceBar v-if="mounted && connectionId" ref="bar" :connection-id="connectionId" />
        <main class="min-h-0 min-w-0 flex-1" :class="route.path.endsWith('/erd') ? 'overflow-hidden' : 'overflow-auto'">
          <slot />
        </main>
      </div>
    </div>

    <footer
      v-if="ui.statusBar"
      class="font-data flex h-6 shrink-0 items-center gap-3 border-t border-border bg-bg-subtle px-3 text-xs text-fg-subtle"
    >
      <ShellConnectionStatus
        v-if="connectionId && activeConnection"
        :key="connectionId"
        :connection-id="connectionId"
        :name="activeConnection.name"
        :dialect="activeConnection.dialect"
        :readonly="activeConnection.readonly"
      />
      <template v-else>
        <span class="size-2 shrink-0 rounded-full bg-fg-subtle" role="img" :aria-label="t('shell.status.disconnected')" data-status-dot />
        <span>{{ t('shell.status.disconnected') }}</span>
      </template>
    </footer>
    <ShellCommandPalette
      v-model:open="paletteOpen"
      :connection-id="connectionId"
      :schema="schema"
      :actions="paletteActions"
    />
    <SchemaNewTableDialog v-if="connectionId && schema" v-model:open="newTableOpen" :connection-id="connectionId" :schema="schema" />
    <ShellGlobalSearch v-if="connectionId && schema" v-model:open="searchOpen" :connection-id="connectionId" :schema="schema" />
    <ShellShortcutsDialog v-model:open="cheatSheetOpen" />
    <ShellSettingsDialog v-model:open="settingsOpen" />
    <template v-if="backup">
      <BackupDumpDialog v-model:open="dumpOpen" :connection="backup.connection" :schema="schema" />
      <BackupRestoreDialog v-model:open="restoreOpen" :connection="backup.connection" :schema="schema" />
    </template>
    <HelpDrawer />
    <HelpTourOverlay />
    <HelpTourCard v-if="tour.offered && route.path === '/' && !tour.active" floating />
    <UiToaster />
  </div>
</template>
