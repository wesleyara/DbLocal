/** CSV and JSON text for exports. Shared so the client (current result) and server (streaming) agree. */

export type ExportFormat = 'csv' | 'json'

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text
}

/** One CSV record, without the line terminator. NULL is an empty field (RFC 4180 has no NULL). */
export function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(',')
}

/** JSON-safe value for an exported cell: bigint becomes a string, Uint8Array a base64 string. */
export function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}

/** Whole result as text (the "export current result" path, entirely in the browser). */
export function formatResult(format: ExportFormat, columns: string[], rows: Record<string, unknown>[]): string {
  if (format === 'json') return JSON.stringify(rows, jsonSafe, 2)
  const lines = [csvLine(columns), ...rows.map((r) => csvLine(columns.map((c) => r[c])))]
  return `${lines.join('\r\n')}\r\n`
}

export const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
}
