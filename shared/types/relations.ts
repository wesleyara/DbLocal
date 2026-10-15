/** Primary key of a row: column name to value. */
export type RecordKey = Record<string, string | number>

/** A related record reduced to what a chip or card needs. */
export interface RecordSummary {
  key: RecordKey
  /** Value of the table's display column. Null when the table has none or the value is null. */
  label: string | null
}

export interface ResolveRequest {
  schema: string
  rows: RecordKey[]
  /** Relation names to resolve. Omitted means every relation of the table. */
  relations?: string[]
}

/** Per requested row, aligned with `ResolveRequest.rows`. */
export interface ResolvedRow {
  /** N:1 / 1:1 parents by relation name. Null when the FK is null or the parent does not exist (orphan). */
  parents: Record<string, RecordSummary | null>
  /** Number of related records for 1:N, inverse 1:1 and N:N relations, by relation name. */
  counts: Record<string, number>
}

export interface ResolveResponse {
  rows: ResolvedRow[]
}

export interface RecordResponse {
  row: Record<string, unknown>
  relations: ResolvedRow
}
