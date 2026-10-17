<script setup lang="ts">
import { useVueFlow } from '@vue-flow/core'
import { ERD_NOTE_MAX_LENGTH, clampNoteWidth, noteWidth, type ErdNote } from '#shared/erd'
import { ERD_UI } from './state'

interface NoteData {
  note: ErdNote
  update: (id: string, text: string) => void
  resize: (id: string, width: number) => void
  remove: (id: string) => void
}

const props = defineProps<{ id: string; data: NoteData }>()
const { t } = useI18n()
const ui = inject(ERD_UI)!
const { viewport } = useVueFlow()

/** The note's own id; the node id (`props.id`) carries a `note:` prefix. */
const noteId = computed(() => props.data.note.id)
const editing = computed(() => ui.editingNote === noteId.value)
const draft = ref('')
const field = ref<HTMLTextAreaElement | null>(null)

watch(
  editing,
  async (on) => {
    if (!on) return
    draft.value = props.data.note.text
    await nextTick()
    focusField()
  },
  { immediate: true },
)

/** A new node stays hidden until Vue Flow has measured it, and a hidden field cannot take focus: retry for a few frames. */
function focusField(tries = 10): void {
  const el = field.value
  if (!el || !editing.value) return
  el.focus()
  if (document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length)
  else if (tries > 0) requestAnimationFrame(() => focusField(tries - 1))
}

// ---- horizontal resize: drag the right edge; saved on release -----------------------------------
const liveWidth = ref<number | null>(null)
const width = computed(() => liveWidth.value ?? noteWidth(props.data.note))

function startResize(e: PointerEvent): void {
  const startX = e.clientX
  const startWidth = width.value
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => {
    // Screen pixels to diagram units, so the edge follows the pointer at any zoom.
    liveWidth.value = clampNoteWidth(startWidth + (ev.clientX - startX) / (viewport.value.zoom || 1))
  }
  const up = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
    handle.removeEventListener('pointercancel', up)
    const next = liveWidth.value
    liveWidth.value = null
    if (next !== null && next !== noteWidth(props.data.note)) props.data.resize(noteId.value, next)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
  handle.addEventListener('pointercancel', up)
}

function startEdit(): void {
  ui.editingNote = noteId.value
}

/** Saves on blur or ⌘Enter; a note left empty is removed. */
function commit(): void {
  if (!editing.value) return
  ui.editingNote = null
  const text = draft.value.trim()
  if (!text) props.data.remove(noteId.value)
  else if (text !== props.data.note.text) props.data.update(noteId.value, text)
}

function cancel(): void {
  ui.editingNote = null
  if (!props.data.note.text) props.data.remove(noteId.value)
}
</script>

<template>
  <div
    class="erd-note group relative rounded-md border border-warning/50 text-xs text-fg shadow-sm"
    :class="ui.compact && 'opacity-60'"
    :data-erd-note="noteId"
    :style="{ width: `${width}px` }"
    @dblclick.stop="startEdit"
  >
    <div class="absolute -top-3 right-1 hidden gap-0.5 rounded-md border border-border bg-surface shadow-sm group-hover:flex" :class="editing && '!hidden'">
      <UiIconButton icon="lucide:pencil" :label="t('erd.editNote')" size="sm" class="nodrag" @click.stop="startEdit" />
      <UiIconButton icon="lucide:trash-2" :label="t('erd.deleteNote')" size="sm" class="nodrag" data-erd-note-delete @click.stop="data.remove(noteId)" />
    </div>
    <Icon
      name="lucide:message-square-text"
      class="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-warning"
      :title="t('erd.note')"
      data-erd-note-icon
    />
    <textarea
      v-if="editing"
      ref="field"
      v-model="draft"
      class="font-data nodrag nowheel block min-h-20 w-full resize-y rounded-md bg-transparent py-2.5 pl-[30px] pr-2.5 leading-4 text-fg outline-none placeholder:text-fg-subtle"
      :maxlength="ERD_NOTE_MAX_LENGTH"
      :placeholder="t('erd.notePlaceholder')"
      :aria-label="t('erd.note')"
      @blur="commit"
      @keydown.esc.stop.prevent="cancel"
      @keydown.enter.meta.prevent="commit"
      @keydown.enter.ctrl.prevent="commit"
    />
    <p v-else class="font-data whitespace-pre-wrap break-words py-2.5 pl-[30px] pr-2.5 leading-4" :title="t('erd.editNoteHint')">{{ data.note.text }}</p>
    <div
      class="nodrag nopan absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-r-md opacity-0 transition-opacity group-hover:opacity-100"
      :class="liveWidth !== null && 'opacity-100'"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('erd.resizeNote')"
      :title="t('erd.resizeNote')"
      data-erd-note-resize
      @pointerdown.stop.prevent="startResize"
      @dblclick.stop
    >
      <span class="absolute right-[3px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-warning/60" />
    </div>
  </div>
</template>

<style scoped>
.erd-note {
  cursor: grab;
  /* Opaque, so a note over a table stays readable. */
  background: linear-gradient(var(--warning-soft), var(--warning-soft)), var(--bg);
}
</style>
