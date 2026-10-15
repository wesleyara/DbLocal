export interface ExplainRequest {
  sql: string
  schema?: string
  /** `EXPLAIN ANALYZE`: actually runs the statement (Postgres and MySQL only). */
  analyze?: boolean
}

/** One node of a query plan, the same shape for the three dialects. Missing numbers are `null`. */
export interface PlanNode {
  /** Operation: `Seq Scan`, `Nested loop inner join`, `SCAN users`... */
  label: string
  /** Relation, index, condition: what the operation works on. */
  detail: string | null
  /** Estimated total cost of the node, including children. */
  cost: number | null
  /** Estimated rows (actual rows when analyzed and available). */
  rows: number | null
  /** Actual time of the node in ms, including children, when analyzed. */
  timeMs: number | null
  children: PlanNode[]
}

export interface ExplainResponse {
  dialect: 'postgres' | 'mysql' | 'sqlite'
  analyzed: boolean
  /** The statement that was explained. */
  statement: string
  /** Parsed tree, or null when the plan could not be parsed (the raw text is still there). */
  plan: PlanNode | null
  /** Plan as the database produced it: JSON text, or the text tree. */
  raw: string
  durationMs: number
}
