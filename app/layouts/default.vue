<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const ui = useUiStore()
const route = useRoute()
const status = await useFetch('/api/auth/status')
const connectionId = computed(() => route.params.connectionId as string | undefined)
const schema = computed(() => route.params.schema as string | undefined)

const themes = computed(() => [
  { value: 'dark', label: t('theme.dark') },
  { value: 'light', label: t('theme.light') },
  { value: 'system', label: t('theme.system') },
])
const localeOptions = computed(() =>
  locales.value.map((l) => ({ value: l.code, label: l.name ?? l.code })),
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
      <span class="text-sm font-semibold">{{ t('app.name') }}</span>
      <div class="ml-2 flex items-center gap-2">
        <UiBadge tone="success">{{ t('env.local') }}</UiBadge>
      </div>
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

      <main class="min-w-0 flex-1 overflow-auto">
        <slot />
      </main>
    </div>

    <footer
      v-if="ui.statusBar"
      class="font-data flex h-6 shrink-0 items-center gap-3 border-t border-border bg-bg-subtle px-3 text-xs text-fg-subtle"
    >
      <span>{{ t('shell.status.disconnected') }}</span>
    </footer>
    <UiToaster />
  </div>
</template>
