export type RoutineKind = 'function' | 'procedure'
export type TriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF'
export type TriggerEvent = 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'

export interface DbRoutine {
  name: string
  kind: RoutineKind
  /** `name(arg types)`, unique among overloads. */
  signature: string
  /** Arguments as written, e.g. `a integer, b text`. */
  args: string
  returns: string | null
  language: string | null
  comment: string | null
  /** Full `CREATE` statement. */
  definition: string
}

export interface DbTrigger {
  name: string
  table: string
  timing: TriggerTiming
  events: TriggerEvent[]
  orientation: 'row' | 'statement'
  /** Postgres can disable a trigger; the other dialects are always enabled. */
  enabled: boolean
  /** Function the trigger calls (Postgres), when known. */
  routine: string | null
  /** Full `CREATE TRIGGER` statement. */
  definition: string
}

export interface RoutinesResponse {
  dialect: 'postgres' | 'mysql' | 'sqlite'
  schema: string
  routines: DbRoutine[]
  triggers: DbTrigger[]
}

export interface RoutinesSnapshot {
  routines: DbRoutine[]
  triggers: DbTrigger[]
}
