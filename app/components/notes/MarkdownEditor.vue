<script setup lang="ts">
import { MdEditor, MdPreview, type ExposeParam } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import './md-editor-setup'
import * as md from '#shared/markdown-toolbar'
import type { MarkdownAction } from '#shared/markdown-toolbar'
import type { MenuItem } from '~/components/ui/DropdownMenu.vue'

/**
 * Markdown editor of the notes (connection and table), the same md-editor-v3 setup as ClickLocal:
 * a compact toolbar over CodeMirror, an Editor / Preview switch and an expanded (full screen) copy.
 * Client-only; load it lazily (`LazyNotesMarkdownEditor`) so mermaid is not in the main bundle.
 */
const props = withDefaults(
  defineProps<{
    height?: string
    expanded?: boolean
    initialMode?: 'editor' | 'preview'
    placeholder?: string
  }>(),
  { height: '240px', expanded: false, initialMode: 'editor', placeholder: '' },
)
const model = defineModel<string>({ required: true })
const { t } = useI18n()

const viewMode = ref<'editor' | 'preview'>(props.initialMode)
const editorRef = ref<ExposeParam>()
const expandedOpen = ref(false)
// md-editor derives mermaid/DOM ids from it, so the expanded copy needs its own.
const editorId = `md-${useId()}`

// Follows the resolved theme on <html> (the ui store's `system` resolves there).
const theme = ref<'dark' | 'light'>('dark')
let observer: MutationObserver | null = null
onMounted(() => {
  const read = () => (theme.value = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  read()
  observer = new MutationObserver(read)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})
onBeforeUnmount(() => observer?.disconnect())

function run(action: MarkdownAction, placeholderKey: string): void {
  if (viewMode.value !== 'editor') return
  editorRef.value?.insert(action(t(`notes.placeholders.${placeholderKey}`)))
}

const headingItems = computed<MenuItem[]>(() => [
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    label: t('notes.toolbar.heading', { level }),
    icon: `lucide:heading-${level}`,
    onSelect: () => run(md.heading(level), 'heading'),
  })),
  { separator: true, label: '' },
  { label: t('notes.toolbar.subscript'), icon: 'lucide:subscript', onSelect: () => run(md.sub, 'text') },
  { label: t('notes.toolbar.superscript'), icon: 'lucide:superscript', onSelect: () => run(md.sup, 'text') },
])

const insertItems = computed<MenuItem[]>(() => [
  { label: t('notes.toolbar.quote'), icon: 'lucide:quote', onSelect: () => run(md.quote, 'quote') },
  { label: t('notes.toolbar.codeInline'), icon: 'lucide:code', onSelect: () => run(md.codeInline, 'code') },
  { label: t('notes.toolbar.codeBlock'), icon: 'lucide:square-code', onSelect: () => run(md.codeBlock, 'code') },
  { label: t('notes.toolbar.sqlBlock'), icon: 'lucide:database', onSelect: () => run(md.sqlBlock, 'sql') },
  { label: t('notes.toolbar.link'), icon: 'lucide:link', onSelect: () => run(md.link, 'link') },
  { label: t('notes.toolbar.image'), icon: 'lucide:image', onSelect: () => run(md.image, 'image') },
  { label: t('notes.toolbar.table'), icon: 'lucide:table', onSelect: () => run(md.table, 'column') },
  { label: t('notes.toolbar.diagram'), icon: 'lucide:workflow', onSelect: () => run(md.mermaid, 'text') },
])

const formatButtons: { icon: string; label: string; action: MarkdownAction; placeholder: string }[] = [
  { icon: 'lucide:bold', label: 'notes.toolbar.bold', action: md.bold, placeholder: 'bold' },
  { icon: 'lucide:italic', label: 'notes.toolbar.italic', action: md.italic, placeholder: 'italic' },
  { icon: 'lucide:underline', label: 'notes.toolbar.underline', action: md.underline, placeholder: 'text' },
  { icon: 'lucide:strikethrough', label: 'notes.toolbar.strike', action: md.strikeThrough, placeholder: 'text' },
]
const listButtons: { icon: string; label: string; action: MarkdownAction; placeholder: string }[] = [
  { icon: 'lucide:list', label: 'notes.toolbar.bulletList', action: md.unorderedList, placeholder: 'item' },
  { icon: 'lucide:list-ordered', label: 'notes.toolbar.orderedList', action: md.orderedList, placeholder: 'item' },
  { icon: 'lucide:list-todo', label: 'notes.toolbar.taskList', action: md.task, placeholder: 'task' },
]
</script>

<template>
  <div class="flex min-h-0 flex-col" data-markdown-editor>
    <div class="flex items-center justify-between gap-2 rounded-t-md border border-border bg-bg-subtle px-1.5 py-1">
      <div v-if="viewMode === 'editor'" class="flex flex-wrap items-center gap-0.5" role="toolbar" :aria-label="t('notes.toolbar.label')">
        <UiIconButton
          v-for="b in formatButtons"
          :key="b.icon"
          size="sm"
          :icon="b.icon"
          :label="t(b.label)"
          @click="run(b.action, b.placeholder)"
        />
        <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <UiDropdownMenu :items="headingItems">
          <button
            type="button"
            class="inline-flex h-6 items-center gap-0.5 rounded-md px-1 text-fg-muted hover:bg-surface hover:text-fg"
            :aria-label="t('notes.toolbar.headings')"
            :title="t('notes.toolbar.headings')"
          >
            <Icon name="lucide:heading" class="size-4" />
            <Icon name="lucide:chevron-down" class="size-3" />
          </button>
        </UiDropdownMenu>
        <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <UiIconButton
          v-for="b in listButtons"
          :key="b.icon"
          size="sm"
          :icon="b.icon"
          :label="t(b.label)"
          @click="run(b.action, b.placeholder)"
        />
        <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <UiDropdownMenu :items="insertItems">
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-fg-muted hover:bg-surface hover:text-fg"
            data-md-insert
          >
            <Icon name="lucide:plus" class="size-3.5" />
            {{ t('notes.toolbar.insert') }}
            <Icon name="lucide:chevron-down" class="size-3" />
          </button>
        </UiDropdownMenu>
      </div>
      <span v-else class="px-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{{ t('notes.preview') }}</span>

      <div class="flex shrink-0 items-center gap-0.5">
        <div class="flex rounded-md border border-border p-0.5" role="group">
          <button
            v-for="mode in (['editor', 'preview'] as const)"
            :key="mode"
            type="button"
            class="h-5 rounded-sm px-2 text-xs"
            :class="viewMode === mode ? 'bg-surface-hover text-fg' : 'text-fg-muted hover:text-fg'"
            :aria-pressed="viewMode === mode"
            :data-md-mode="mode"
            @click="viewMode = mode"
          >
            {{ t(`notes.${mode}`) }}
          </button>
        </div>
        <slot v-if="expanded" name="actions" />
        <template v-else>
          <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          <UiIconButton size="sm" icon="lucide:maximize-2" :label="t('notes.expand')" data-md-expand @click="expandedOpen = true" />
        </template>
      </div>
    </div>

    <ClientOnly>
      <MdEditor
        v-if="viewMode === 'editor'"
        ref="editorRef"
        v-model="model"
        :editor-id="editorId"
        language="en-US"
        preview-theme="default"
        :theme="theme"
        :preview="false"
        :toolbars="[]"
        :footers="[]"
        :placeholder="placeholder"
        :show-code-row-number="true"
        :no-prettier="true"
        :no-upload-img="true"
        :no-katex="true"
        :no-echarts="true"
        :no-img-zoom-in="true"
        :class="`notes-md !rounded-t-none${expanded ? ' notes-md-expanded' : ''}`"
        :style="{ height }"
      />
      <MdPreview
        v-else
        :editor-id="editorId"
        :model-value="model"
        language="en-US"
        preview-theme="default"
        :theme="theme"
        :show-code-row-number="true"
        :no-katex="true"
        :no-echarts="true"
        :no-img-zoom-in="true"
        :class="`notes-md rounded-b-md border border-t-0 border-border px-4 py-3${expanded ? ' notes-md-expanded' : ''}`"
        :style="{ height }"
        data-md-preview
      />
    </ClientOnly>

    <DialogRoot v-if="!expanded" v-model:open="expandedOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
        <DialogContent class="fixed inset-0 z-50 flex flex-col gap-3 bg-bg px-4 py-3 sm:px-6" data-md-expanded>
          <DialogTitle class="sr-only">{{ t('notes.expand') }}</DialogTitle>
          <DialogDescription class="sr-only">{{ t('notes.expandHint') }}</DialogDescription>
          <NotesMarkdownEditor
            v-model="model"
            expanded
            :initial-mode="viewMode"
            :placeholder="placeholder"
            height="calc(100dvh - 4.5rem)"
          >
            <template #actions>
              <span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
              <UiIconButton size="sm" icon="lucide:minimize-2" :label="t('notes.collapse')" @click="expandedOpen = false" />
            </template>
          </NotesMarkdownEditor>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>

<style scoped>
/* md-editor's `.md-editor-previewOnly` sets `overflow: visible` on the MdPreview root, so long content
 * would bleed past the fixed height instead of scrolling inside it. */
:deep(.md-editor-previewOnly) {
  overflow-y: auto !important;
}
:deep(.md-editor-previewOnly .md-editor-preview-wrapper) {
  padding: 0;
}
:deep(.md-editor-previewOnly .md-editor-preview > :first-child) {
  margin-top: 0;
}
/* Expanded: the box spans the screen, the text stays in a readable column. */
:deep(.notes-md-expanded .cm-content),
:deep(.notes-md-expanded .md-editor-preview) {
  width: 100%;
  max-width: 64rem;
  margin-inline: auto !important;
}
</style>
