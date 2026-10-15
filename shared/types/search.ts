export type SearchMode = 'exact' | 'contains'

export interface SearchRequest {
  schema: string
  term: string
  mode: SearchMode
  /** Restrict the search to these tables. Omitted means every table of the schema. */
  tables?: string[]
  /** Rows kept per table (default 10, max 50). */
  limitPerTable?: number
}

export const DEFAULT_SEARCH_LIMIT = 10
export const MAX_SEARCH_LIMIT = 50
export const MAX_SEARCH_TERM = 200

/**
 * One line of the streamed answer (NDJSON). `table` carries the matching rows of one table,
 * `error` a table that could not be searched (the search goes on), `done` closes the stream.
 */
export type SearchEvent =
  | { type: 'start'; tables: number }
  | {
      type: 'table'
      table: string
      /** Columns that were compared with the term. */
      columns: string[]
      primaryKey: string[]
      rows: Record<string, unknown>[]
      truncated: boolean
    }
  | { type: 'error'; table: string; message: string }
  | { type: 'done'; searched: number; skipped: number; cancelled: boolean }
