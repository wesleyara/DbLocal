import type { FilterNode, SortItem } from './types/rows'

/** Encodes a value as base64url(JSON), safe to put in a query string. UTF-8 safe. */
export function encodeUrlState(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decodes `encodeUrlState` output. Returns null for anything that is not valid, never throws. */
export function decodeUrlState<T>(text: string | null | undefined): T | null {
  if (!text) return null
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

/** The grid state that lives in the URL, so a view can be reopened from a deep link. */
export interface GridUrlState {
  filter: FilterNode | null
  sort: SortItem[]
  page: number
  pageSize: number
}
