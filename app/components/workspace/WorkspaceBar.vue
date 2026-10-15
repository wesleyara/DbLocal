<script setup lang="ts">
import { useToast } from '~/composables/useToast'
import { useWorkspaceStore, type WorkspaceTab } from '~/stores/workspace'

const props = defineProps<{ connectionId: string }>()
const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const workspace = useWorkspaceStore()

const tabs = computed(() => workspace.forConnection(props.connectionId))
const active = computed(() => workspace.active)
const trail = computed(() => (active.value?.connectionId === props.connectionId ? active.value.trail : []))

const dragging = ref<string | null>(null)
const confirmClose = ref<WorkspaceTab | null>(null)

async function activate(tab: WorkspaceTab): Promise<void> {
  const path = workspace.activate(tab.id)
  if (path && path !== route.fullPath) await navigateTo(path)
}

async function doClose(tab: WorkspaceTab): Promise<void> {
  const wasActive = workspace.activeId === tab.id
  const next = workspace.close(tab.id)
  if (wasActive && next) await navigateTo(next)
  else if (wasActive) await navigateTo(`/c/${props.connectionId}`)
}

function requestClose(tab: WorkspaceTab): void {
  if (tab.dirty) confirmClose.value = tab
  else void doClose(tab)
}

async function confirmedClose(): Promise<void> {
  const tab = confirmClose.value
  confirmClose.value = null
  if (tab) await doClose(tab)
}

async function duplicate(tab: WorkspaceTab): Promise<void> {
  const copy = workspace.duplicate(tab.id)
  if (copy) await activate(copy)
}

function menuFor(tab: WorkspaceTab) {
  return [
    { label: t('tabs.duplicate'), icon: 'lucide:copy', onSelect: () => void duplicate(tab) },
    { separator: true } as never,
    { label: t('tabs.close'), icon: 'lucide:x', onSelect: () => requestClose(tab) },
    { label: t('tabs.closeOthers'), icon: 'lucide:panel-top-close', onSelect: () => workspace.closeOthers(tab.id) },
  ]
}

async function goBack(): Promise<void> {
  const path = workspace.backPath()
  if (path) await navigateTo(path)
}
async function goForward(): Promise<void> {
  const path = workspace.forwardPath()
  if (path) await navigateTo(path)
}
async function goTrail(index: number): Promise<void> {
  const tab = active.value
  if (!tab) return
  const path = workspace.trimTrail(tab.id, index)
  if (path) await navigateTo(path)
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${route.fullPath}`)
    toast.push({ kind: 'success', title: t('breadcrumb.linkCopied') })
  } catch {
    toast.push({ kind: 'error', title: t('breadcrumb.linkFailed') })
  }
}

defineExpose({ goBack, goForward, requestClose })
</script>

<template>
  <div v-if="tabs.length" class="shrink-0 border-b border-border bg-bg-subtle" data-workspace-bar>
    <div class="flex items-end gap-px overflow-x-auto px-1 pt-1" role="tablist" :aria-label="t('tabs.label')">
      <UiContextMenu v-for="tab in tabs" :key="tab.id" :items="menuFor(tab)">
        <div
          role="tab"
          :aria-selected="tab.id === workspace.activeId"
          draggable="true"
          class="group flex h-7 max-w-52 min-w-24 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-2 text-xs"
          :class="tab.id === workspace.activeId ? 'border-border bg-bg text-fg' : 'border-transparent text-fg-muted hover:bg-surface-hover'"
          :data-tab="tab.title"
          @click="activate(tab)"
          @auxclick.middle.prevent="requestClose(tab)"
          @dragstart="dragging = tab.id"
          @dragover.prevent
          @drop.prevent="dragging && workspace.move(dragging, tab.id); dragging = null"
        >
          <Icon :name="tab.icon" class="size-3.5 shrink-0" />
          <span class="font-data min-w-0 flex-1 truncate">{{ tab.title }}</span>
          <span v-if="tab.dirty" class="size-1.5 shrink-0 rounded-full bg-warning" :title="t('tabs.unsaved')" />
          <button
            type="button"
            class="flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-hover hover:text-fg"
            :aria-label="t('tabs.close')"
            @click.stop="requestClose(tab)"
          >
            <Icon name="lucide:x" class="size-3" />
          </button>
        </div>
      </UiContextMenu>
    </div>

    <nav class="flex h-8 items-center gap-1 border-t border-border bg-bg px-2" :aria-label="t('breadcrumb.label')">
      <UiIconButton icon="lucide:arrow-left" :label="t('breadcrumb.back')" size="sm" :disabled="!workspace.canGoBack()" @click="goBack" />
      <UiIconButton icon="lucide:arrow-right" :label="t('breadcrumb.forward')" size="sm" :disabled="!workspace.canGoForward()" @click="goForward" />
      <ol class="font-data ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs" data-breadcrumb>
        <li v-for="(segment, index) in trail" :key="`${index}:${segment.path}`" class="flex min-w-0 items-center gap-1">
          <Icon v-if="index > 0" name="lucide:chevron-right" class="size-3 shrink-0 text-fg-subtle" />
          <span v-if="index === trail.length - 1" class="truncate text-fg" aria-current="page">{{ segment.label }}</span>
          <button v-else type="button" class="truncate text-fg-muted hover:text-accent hover:underline" @click="goTrail(index)">
            {{ segment.label }}
          </button>
        </li>
      </ol>
      <UiButton size="sm" variant="ghost" @click="copyLink">
        <Icon name="lucide:link" class="size-3.5" />
        {{ t('breadcrumb.copyLink') }}
      </UiButton>
    </nav>

    <UiDialog :open="!!confirmClose" :title="t('tabs.unsavedTitle')" :description="t('tabs.unsavedBody', { name: confirmClose?.title ?? '' })" @update:open="(v) => !v && (confirmClose = null)">
      <template #footer>
        <UiButton size="sm" variant="secondary" @click="confirmClose = null">{{ t('common.cancel') }}</UiButton>
        <UiButton size="sm" variant="danger" @click="confirmedClose">{{ t('tabs.discardAndClose') }}</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
