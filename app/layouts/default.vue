<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const ui = useUiStore()
const route = useRoute()
const status = await useFetch('/api/auth/status')
const connectionId = computed(() => route.params.connectionId as string | undefined)
const schema = computed(() => route.params.schema as string | undefined)

useHead({ htmlAttrs: { lang: () => locale.value } })

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

function onShortcut(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey
  const id = connectionId.value
  if (!mod || !id) return
  const target = event.target as HTMLElement | null
  const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  if (typing) return
  if (event.key === '[' && !event.shiftKey) {
    event.preventDefault()
    bar.value?.goBack()
  } else if (event.key === ']' && !event.shiftKey) {
    event.preventDefault()
    bar.value?.goForward()
  } else if (event.shiftKey && (event.key === '[' || event.key === '{' || event.key === ']' || event.key === '}')) {
    event.preventDefault()
    const next = workspace.neighbour(id, event.key === '[' || event.key === '{' ? -1 : 1)
    if (next) {
      workspace.activate(next.id)
      void navigateTo(next.path)
    }
  } else if (event.key.toLowerCase() === 'w' && workspace.active?.connectionId === id) {
    event.preventDefault()
    bar.value?.requestClose(workspace.active as never)
  }
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
  window.addEventListener('keydown', onShortcut)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
watch(
  () =>
    `${connectionId.value}|${schema.value}|${route.fullPath}|${queries.drafts[route.params.qid as string]?.name ?? ''}`,
  () => mounted.value && syncWorkspace(),
)

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
      <div class="mx-auto hidden w-full max-w-sm items-center md:flex">
        <UiInput :placeholder="t('shell.search')" :aria-label="t('shell.search')" />
      </div>
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
    <UiToaster />
  </div>
</template>
