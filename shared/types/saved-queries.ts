export interface SavedQuery {
  id: string
  connectionId: string | null
  name: string
  sql: string
  folder: string | null
  createdAt: string
  updatedAt: string
}

export interface SavedQueryInput {
  name: string
  sql: string
  connectionId?: string | null
  folder?: string | null
}

export type SavedQueryPatch = Partial<SavedQueryInput>

export interface HistoryEntry {
  id: number
  connectionId: string | null
  sql: string
  durationMs: number | null
  rowCount: number | null
  status: string
  error: string | null
  executedAt: string
}

export interface HistoryQuery {
  q?: string
  connectionId?: string
  status?: string
  limit?: number
  offset?: number
}

export interface HistoryPage {
  entries: HistoryEntry[]
  total: number
}

export const DEFAULT_HISTORY_RETENTION = 5000
