/**
 * Generators for md-editor-v3's `insert(generator)` API, which drive the compact toolbar of
 * `components/notes/MarkdownEditor.vue` instead of the library's own (much wider) one.
 * Ported from ClickLocal; placeholders come from i18n, so each generator takes one.
 *
 * md-editor-v3 semantics: `deviationStart` is measured from the START of the inserted text,
 * `deviationEnd` from its END (0 = up to the end, negative = back off).
 */
export interface InsertResult {
  targetValue: string
  select?: boolean
  deviationStart?: number
  deviationEnd?: number
}

export type InsertGenerator = (selectedText: string) => InsertResult
/** A toolbar action: given the placeholder used when nothing is selected, the generator to insert. */
export type MarkdownAction = (placeholder: string) => InsertGenerator

function wrapSelection(before: string, after: string): MarkdownAction {
  return (placeholder) => (selectedText) => {
    const text = selectedText || placeholder
    return { targetValue: `${before}${text}${after}`, select: true, deviationStart: before.length, deviationEnd: -after.length }
  }
}

function linePrefix(prefix: string): MarkdownAction {
  return (placeholder) => (selectedText) => {
    const text = selectedText || placeholder
    return { targetValue: `${prefix}${text}`, select: true, deviationStart: prefix.length, deviationEnd: 0 }
  }
}

export const bold = wrapSelection('**', '**')
export const italic = wrapSelection('*', '*')
export const underline = wrapSelection('<u>', '</u>')
export const strikeThrough = wrapSelection('~~', '~~')
export const sub = wrapSelection('<sub>', '</sub>')
export const sup = wrapSelection('<sup>', '</sup>')
export const quote = linePrefix('> ')
export const unorderedList = linePrefix('- ')
export const orderedList = linePrefix('1. ')
export const task = linePrefix('- [ ] ')
export const codeInline = wrapSelection('`', '`')

export function heading(level: 1 | 2 | 3 | 4 | 5 | 6): MarkdownAction {
  return linePrefix(`${'#'.repeat(level)} `)
}

export const codeBlock: MarkdownAction = (placeholder) => (selectedText) => {
  const text = selectedText || placeholder
  return { targetValue: `\n\`\`\`\n${text}\n\`\`\`\n`, select: true, deviationStart: 5, deviationEnd: -5 }
}

/** SQL fenced block: the most common snippet in a database note. */
export const sqlBlock: MarkdownAction = (placeholder) => (selectedText) => {
  const text = selectedText || placeholder
  return { targetValue: `\n\`\`\`sql\n${text}\n\`\`\`\n`, select: true, deviationStart: 8, deviationEnd: -5 }
}

export const link: MarkdownAction = (placeholder) => (selectedText) => {
  const text = selectedText || placeholder
  return { targetValue: `[${text}](https://)`, select: true, deviationStart: text.length + 3, deviationEnd: -1 }
}

export const image: MarkdownAction = (placeholder) => (selectedText) => {
  const text = selectedText || placeholder
  return { targetValue: `![${text}](https://)`, select: true, deviationStart: text.length + 4, deviationEnd: -1 }
}

export const table: MarkdownAction = (placeholder) => () => ({
  targetValue: `\n| ${placeholder} | ${placeholder} |\n| --- | --- |\n|  |  |\n`,
  select: false,
})

export const mermaid: MarkdownAction = () => () => ({
  targetValue: '\n```mermaid\nerDiagram\n  USERS ||--o{ ORDERS : places\n```\n',
  select: false,
})

/** Applies a generator to a plain string at `[start, end)`, as md-editor does; used by the tests. */
export function applyInsert(value: string, start: number, end: number, generator: InsertGenerator): { value: string; selection: [number, number] } {
  const result = generator(value.slice(start, end))
  const next = value.slice(0, start) + result.targetValue + value.slice(end)
  const selStart = start + (result.deviationStart ?? 0)
  const selEnd = start + result.targetValue.length + (result.deviationEnd ?? 0)
  return { value: next, selection: result.select ? [selStart, selEnd] : [start + result.targetValue.length, start + result.targetValue.length] }
}
