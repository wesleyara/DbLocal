import type { BinaryPreview } from '#shared/types/rows'

/** Bytes of a binary value sent to the client. The grid shows a hex preview, never the whole blob. */
export const BINARY_PREVIEW_BYTES = 4096

/**
 * Turns driver values into JSON-safe ones: dates to ISO strings, bigints to strings (no precision
 * loss), binary to a truncated base64 preview. Everything else (numbers, strings, booleans, parsed
 * JSON, arrays) already serialises as it is.
 */
export function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) {
    const head = value.subarray(0, BINARY_PREVIEW_BYTES)
    const preview: BinaryPreview = {
      $binary: Buffer.from(head).toString('base64'),
      size: value.byteLength,
      truncated: value.byteLength > BINARY_PREVIEW_BYTES,
    }
    return preview
  }
  return value
}

export function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) out[key] = serializeValue(value)
  return out
}
