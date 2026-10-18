/**
 * Reads a CSV or JSON file into columns and rows for the import dialog. Pure, so the browser parses
 * the file and the tests run without one. CSV follows RFC 4180 (quotes, doubled quotes, CR LF or
 * LF, a leading BOM); its cells stay text. JSON is an array of objects (or one object per line).
 */

export type ImportFormat = 'csv' | 'json'
export type CsvDelimiter = ',' | ';' | '\t' | '|'

export interface ImportData {
  columns: string[]
  /** One array per record, aligned with `columns`. A JSON record without the key has `undefined`. */
  rows: unknown[][]
}

export type ParseError = 'empty' | 'json' | 'jsonShape' | 'csvQuote'
export type ParseResult = { ok: true; data: ImportData } | { ok: false; error: ParseError }

const DELIMITERS: CsvDelimiter[] = [',', ';', '\t', '|']

const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

/** JSON when the name says so or the text starts like JSON; CSV otherwise. */
export function detectFormat(fileName: string, text: string): ImportFormat {
  if (/\.(json|ndjson|jsonl)$/i.test(fileName)) return 'json'
  if (/\.(csv|tsv|txt)$/i.test(fileName)) return 'csv'
  return /^\s*[[{]/.test(stripBom(text)) ? 'json' : 'csv'
}

/** The delimiter that appears most often in the header line, outside quotes. Comma on a tie. */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((d) => [d, 0]))
  let quoted = false
  for (const ch of stripBom(text)) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && counts.has(ch as CsvDelimiter)) counts.set(ch as CsvDelimiter, counts.get(ch as CsvDelimiter)! + 1)
  }
  let best: CsvDelimiter = ','
  for (const d of DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d
  return best
}

/** Blank header cells become `column_N`; a repeated name gets `_2`, `_3` (like the SQL results). */
function headerNames(cells: string[]): string[] {
  const seen = new Map<string, number>()
  return cells.map((cell, i) => {
    const base = cell.trim() || `column_${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
}

export function parseCsv(input: string, delimiter: CsvDelimiter = detectDelimiter(input)): ParseResult {
  const text = stripBom(input)
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
      } else cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      record.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else cell += ch
    i++
  }
  if (quoted) return { ok: false, error: 'csvQuote' }
  if (cell !== '' || record.length > 0) {
    record.push(cell)
    records.push(record)
  }
  // Blank lines (a trailing newline, an empty line at the end) are not records.
  const kept = records.filter((r) => r.length > 1 || r[0] !== '')
  if (kept.length === 0) return { ok: false, error: 'empty' }
  const columns = headerNames(kept[0]!)
  const rows = kept.slice(1).map((r) => columns.map((_, c) => r[c] ?? ''))
  return { ok: true, data: { columns, rows } }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseJson(input: string): ParseResult {
  const text = stripBom(input).trim()
  if (text === '') return { ok: false, error: 'empty' }
  let records: unknown[]
  try {
    const parsed = JSON.parse(text) as unknown
    records = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    // One object per line (NDJSON / JSON Lines).
    try {
      records = text
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '')
        .map((l) => JSON.parse(l) as unknown)
    } catch {
      return { ok: false, error: 'json' }
    }
  }
  if (records.length === 0) return { ok: false, error: 'empty' }
  if (!records.every(isRecord)) return { ok: false, error: 'jsonShape' }
  const columns: string[] = []
  const known = new Set<string>()
  for (const r of records as Record<string, unknown>[]) {
    for (const key of Object.keys(r)) {
      if (!known.has(key)) {
        known.add(key)
        columns.push(key)
      }
    }
  }
  const rows = (records as Record<string, unknown>[]).map((r) => columns.map((c) => (c in r ? r[c] : undefined)))
  return { ok: true, data: { columns, rows } }
}

export function parseImport(text: string, format: ImportFormat, delimiter?: CsvDelimiter): ParseResult {
  return format === 'json' ? parseJson(text) : parseCsv(text, delimiter)
}
