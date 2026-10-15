<script setup lang="ts">
import type { PaletteAction } from '~/components/shell/CommandPalette.vue'
import { usePendingStore } from '~/stores/pending-changes'
import { useSchemaStore } from '~/stores/schema'
const { t, locale, locales, setLocale } = useI18n()
const ui = useUiStore()
const { format } = useShortcuts()
const route = useRoute()
const status = await useFetch('/api/auth/status')
const connectionId = computed(() => route.params.connectionId as string | undefined)
const schema = computed(() => route.params.schema as string | undefined)

const { data: activeConnection } = await useAsyncData(
  'active-connection',
  () =>
    connectionId.value
      ? $fetch<{ name: string; dialect: string; readonly: boolean }>(`/api/connections/${connectionId.value}`).catch(
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

const themes = computed(() => [
  { value: 'dark', label: t('theme.dark') },
  { value: 'light', label: t('theme.light') },
  { value: 'system', label: t('theme.system') },
])
const localeOptions = computed(() =>
  locales.value.map((l) => ({ value: l.code, label: l.name ?? l.code })),
)

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

onMounted(() => {
  workspace.hydrate()
  queries.hydrate()
  mounted.value = true
  syncWorkspace()
})
watch(
  () =>
    `${connectionId.value}|${schema.value}|${route.fullPath}|${queries.drafts[route.params.qid as string]?.name ?? ''}`,
  () => mounted.value && syncWorkspace(),
)

// ---- productivity: palette, global search, cheat sheet and the shortcut registry -----------------
const paletteOpen = ref(false)
const searchOpen = ref(false)
const cheatSheetOpen = ref(false)
const pendingStore = usePendingStore()
const schemaStore = useSchemaStore()
const hasSchema = computed(() => !!connectionId.value && !!schema.value)

function toggleTheme() {
  ui.theme = ui.theme === 'dark' ? 'light' : 'dark'
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
      { id: 'erd', label: t('palette.actions.openErd'), icon: 'lucide:network', keywords: 'diagram', run: openErd },
      { id: 'search', label: t('palette.actions.search'), icon: 'lucide:text-search', shortcut: 'global.search', run: () => (searchOpen.value = true) },
      { id: 'refresh', label: t('palette.actions.refreshSchema'), icon: 'lucide:refresh-cw', run: () => void refreshSchema() },
      { id: 'reload', label: t('palette.actions.reloadData'), icon: 'lucide:rotate-cw', shortcut: 'nav.reload', run: () => void pendingStore.version++ },
    )
  }
  list.push(
    { id: 'theme', label: t('palette.actions.toggleTheme'), icon: 'lucide:sun-moon', keywords: 'dark light', run: toggleTheme },
    { id: 'locale', label: t('palette.actions.switchLanguage'), icon: 'lucide:languages', keywords: 'idioma english português', run: toggleLocale },
    { id: 'sidebar', label: t('shell.toggleSidebar'), icon: 'lucide:panel-left', shortcut: 'nav.sidebar', run: () => (ui.sidebarCollapsed = !ui.sidebarCollapsed) },
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

    <header class="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
      <UiIconButton
        icon="lucide:panel-left"
        :label="t('shell.toggleSidebar')"
        @click="ui.sidebarCollapsed = !ui.sidebarCollapsed"
      />
      <NuxtLink to="/" :title="t('shell.home')" class="text-sm font-semibold hover:text-accent">{{ t('app.name') }}</NuxtLink>
      <div class="ml-2 flex items-center gap-2">
        <UiBadge tone="success">{{ t('env.local') }}</UiBadge>
      </div>
      <UiButton v-if="connectionId && schema" size="sm" data-new-query @click="newQuery">
        <Icon name="lucide:terminal" class="size-3.5" />{{ t('query.new') }}
      </UiButton>
      <UiButton v-if="connectionId && schema" size="sm" data-open-erd @click="openErd">
        <Icon name="lucide:network" class="size-3.5" />{{ t('erd.open') }}
      </UiButton>
      <button
        type="button"
        class="mx-auto hidden h-7 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-bg-subtle px-2 text-left text-sm text-fg-subtle hover:bg-surface md:flex"
        data-open-palette
        :aria-label="t('palette.title')"
        @click="paletteOpen = true"
      >
        <Icon name="lucide:search" class="size-3.5" />
        <span class="flex-1 truncate">{{ t('shell.search') }}</span>
        <span class="flex gap-0.5"><UiKbd v-for="part in format('mod+k')" :key="part">{{ part }}</UiKbd></span>
      </button>
      <div class="ml-auto flex items-center gap-2">
        <UiSelect
          :model-value="ui.theme"
          :options="themes"
          @update:model-value="(v) => v && (ui.theme = v as 'dark' | 'light' | 'system')"
        />
        <UiSelect
          :model-value="locale"
          :options="localeOptions"
          @update:model-value="(v) => v && setLocale(v as 'en' | 'pt-BR')"
        />
      </div>
    </header>

    <div class="flex min-h-0 flex-1" @pointermove="onResize" @pointerup="dragging = false">
      <aside
        v-if="!ui.sidebarCollapsed"
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
        />
        <UiEmptyState
          v-else
          icon="lucide:database"
          :title="t('shell.noConnection')"
          :description="t('shell.noConnectionHint')"
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
      <template v-if="activeConnection">
        <span>{{ t('shell.status.connected', { name: activeConnection.name }) }}</span>
        <span>{{ activeConnection.dialect }}</span>
        <span v-if="activeConnection.readonly" class="text-warning">{{ t('shell.status.readonly') }}</span>
      </template>
      <span v-else>{{ t('shell.status.disconnected') }}</span>
    </footer>
    <ShellCommandPalette
      v-model:open="paletteOpen"
      :connection-id="connectionId"
      :schema="schema"
      :actions="paletteActions"
    />
    <ShellGlobalSearch v-if="connectionId && schema" v-model:open="searchOpen" :connection-id="connectionId" :schema="schema" />
    <ShellShortcutsDialog v-model:open="cheatSheetOpen" />
    <UiToaster />
  </div>
</template>
