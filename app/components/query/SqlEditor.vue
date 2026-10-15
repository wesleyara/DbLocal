<script setup lang="ts">
import type * as Monaco from 'monaco-editor'
import { format as formatSql } from 'sql-formatter'
import { suggest, type SuggestionKind } from '#shared/sql-completion'
import { splitStatements, statementAt, type SqlDialect } from '#shared/sql-split'
import type { RelationGraph, SchemaSnapshot } from '#shared/types/db'

const model = defineModel<string>({ required: true })
const props = defineProps<{
  dialect: SqlDialect
  snapshot: SchemaSnapshot | null
  graph: RelationGraph | null
  /** 1-based line to mark as the place of the last error. */
  errorLine?: number | null
}>()
const emit = defineEmits<{
  /** ⌘Enter: the selection, or the statement under the cursor. */
  run: [sql: string]
  /** ⌘⇧Enter: the whole script. */
  runAll: []
  save: []
}>()

const host = ref<HTMLElement | null>(null)
const ready = ref(false)
let monaco: typeof Monaco | null = null
let editor: Monaco.editor.IStandaloneCodeEditor | null = null
let completion: Monaco.IDisposable | null = null
let observer: MutationObserver | null = null
let applying = false

/** Any CSS colour as `#rrggbb`: Monaco themes only take hex, the tokens may be oklch. */
function hex(token: string, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (!raw) return fallback
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`
  } catch {
    return fallback
  }
}

function defineTheme(): string {
  const m = monaco!
  const dark = document.documentElement.dataset.theme !== 'light' &&
    (document.documentElement.dataset.theme === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches)
  const bg = hex('--bg', dark ? '#09090b' : '#ffffff')
  const fg = hex('--fg', dark ? '#fafafa' : '#18181b')
  const muted = hex('--fg-subtle', '#71717a')
  const accent = hex('--accent', '#6d5ce8')
  const border = hex('--border', '#3f3f46')
  const surface = hex('--surface', bg)
  m.editor.defineTheme('dblocal', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: accent.slice(1) },
      { token: 'comment', foreground: muted.slice(1), fontStyle: 'italic' },
      { token: 'string', foreground: hex('--type-string', '#16a34a').slice(1) },
      { token: 'number', foreground: hex('--type-number', '#d97706').slice(1) },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': fg,
      'editor.lineHighlightBackground': surface,
      'editorWidget.background': surface,
      'editorSuggestWidget.background': surface,
      'editorSuggestWidget.border': border,
      'editor.selectionBackground': `${accent}55`,
      'editorCursor.foreground': accent,
    },
  })
  return 'dblocal'
}

const KIND_MAP: Record<SuggestionKind, keyof typeof Monaco.languages.CompletionItemKind> = {
  table: 'Class',
  column: 'Field',
  keyword: 'Keyword',
  function: 'Function',
  join: 'Snippet',
}

async function setup(): Promise<void> {
  const [api, EditorWorker] = await Promise.all([
    import('monaco-editor/editor/editor.main'),
    import('monaco-editor/editor/editor.worker?worker'),
  ])
  if (!host.value) return
  monaco = api as unknown as typeof Monaco
  ;(self as unknown as { MonacoEnvironment: object }).MonacoEnvironment = { getWorker: () => new EditorWorker.default() }

  const language = props.dialect === 'postgres' ? 'pgsql' : props.dialect === 'mysql' ? 'mysql' : 'sql'
  editor = monaco.editor.create(host.value, {
    value: model.value,
    language,
    theme: defineTheme(),
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 13,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    lineNumbersMinChars: 3,
    renderLineHighlight: 'line',
    tabSize: 2,
    padding: { top: 8 },
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
  })
  const { KeyMod, KeyCode } = monaco
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => emit('run', currentSql()))
  editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () => emit('runAll'))
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => emit('save'))
  editor.addCommand(KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF, () => format())
  editor.onDidChangeModelContent(() => {
    if (applying) return
    model.value = editor!.getValue()
  })

  completion = monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(doc, position) {
      const before = doc.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
      const word = doc.getWordUntilPosition(position)
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      const items = suggest(before, doc.getValue(), props.snapshot, props.graph)
      return {
        suggestions: items.map((s) => ({
          label: s.label,
          kind: monaco!.languages.CompletionItemKind[KIND_MAP[s.kind]],
          insertText: s.insert ?? s.label,
          detail: s.detail,
          sortText: `${String(s.rank + 1).padStart(2, '0')}${s.label}`,
          range,
        })),
      }
    },
  })

  observer = new MutationObserver(() => monaco?.editor.setTheme(defineTheme()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  ready.value = true
  markError()
}

/** Text of the selection, or of the statement the cursor is in, or the whole script as a last resort. */
function currentSql(): string {
  if (!editor) return model.value
  const selection = editor.getSelection()
  const doc = editor.getModel()!
  if (selection && !selection.isEmpty()) return doc.getValueInRange(selection)
  const offset = doc.getOffsetAt(editor.getPosition()!)
  const found = statementAt(splitStatements(doc.getValue(), props.dialect), offset)
  return found?.sql ?? doc.getValue()
}

function format(): void {
  if (!editor) return
  const language = props.dialect === 'postgres' ? 'postgresql' : props.dialect === 'mysql' ? 'mysql' : 'sqlite'
  try {
    const out = formatSql(editor.getValue(), { language, keywordCase: 'upper', tabWidth: 2 })
    editor.executeEdits('format', [{ range: editor.getModel()!.getFullModelRange(), text: out }])
  } catch {
    // unparsable SQL stays as typed
  }
}

function markError(): void {
  if (!monaco || !editor) return
  const doc = editor.getModel()!
  const line = props.errorLine
  monaco.editor.setModelMarkers(
    doc,
    'dblocal',
    line && line >= 1 && line <= doc.getLineCount()
      ? [{ severity: monaco.MarkerSeverity.Error, message: '', startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: doc.getLineMaxColumn(line) }]
      : [],
  )
  if (line) editor.revealLineInCenterIfOutsideViewport(line)
}
watch(() => props.errorLine, markError)

watch(model, (value) => {
  if (!editor || editor.getValue() === value) return
  applying = true
  editor.setValue(value)
  applying = false
})

defineExpose({ format, focus: () => editor?.focus(), currentSql })

onMounted(() => void setup())
onBeforeUnmount(() => {
  observer?.disconnect()
  completion?.dispose()
  editor?.dispose()
})
</script>

<template>
  <div class="relative h-full min-h-24 w-full">
    <div ref="host" class="absolute inset-0" data-sql-editor />
    <div v-if="!ready" class="absolute inset-0 flex items-center justify-center bg-bg">
      <UiSpinner class="size-4" />
    </div>
  </div>
</template>
