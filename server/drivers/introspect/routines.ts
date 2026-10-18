import type { DbRoutine, DbTrigger, RoutinesSnapshot, TriggerEvent, TriggerTiming } from '#shared/types/routines'
import type { QueryFn } from './common'

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const PG_ROUTINES_SQL = `
SELECT p.proname AS name,
       CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS kind,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       pg_get_function_arguments(p.oid) AS args,
       CASE WHEN p.prokind = 'p' THEN NULL ELSE pg_get_function_result(p.oid) END AS returns,
       l.lanname AS language,
       obj_description(p.oid, 'pg_proc') AS comment,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = $1
  AND p.prokind IN ('f', 'p')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
ORDER BY p.proname, identity_args`

const PG_TRIGGERS_SQL = `
SELECT t.tgname AS name,
       c.relname AS "table",
       t.tgtype AS tgtype,
       t.tgenabled AS enabled,
       pn.nspname AS routine_schema,
       p.proname AS routine,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = $1 AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname`

interface PgRoutineRow {
  name: string
  kind: 'function' | 'procedure'
  identity_args: string
  args: string
  returns: string | null
  language: string | null
  comment: string | null
  definition: string
}

interface PgTriggerRow {
  name: string
  table: string
  tgtype: number
  enabled: string
  routine_schema: string
  routine: string
  definition: string
}

/** Decodes `pg_trigger.tgtype` bits: 1 row, 2 before, 4 insert, 8 delete, 16 update, 32 truncate, 64 instead of. */
export function pgTriggerKind(tgtype: number): Pick<DbTrigger, 'timing' | 'events' | 'orientation'> {
  const events: TriggerEvent[] = []
  if (tgtype & 4) events.push('INSERT')
  if (tgtype & 16) events.push('UPDATE')
  if (tgtype & 8) events.push('DELETE')
  if (tgtype & 32) events.push('TRUNCATE')
  const timing: TriggerTiming = tgtype & 64 ? 'INSTEAD OF' : tgtype & 2 ? 'BEFORE' : 'AFTER'
  return { timing, events, orientation: tgtype & 1 ? 'row' : 'statement' }
}

export async function routinesPostgres(query: QueryFn, schema: string): Promise<RoutinesSnapshot> {
  const [routines, triggers] = await Promise.all([
    query<PgRoutineRow>(PG_ROUTINES_SQL, [schema]),
    query<PgTriggerRow>(PG_TRIGGERS_SQL, [schema]),
  ])
  return {
    routines: routines.map(
      (r): DbRoutine => ({
        name: r.name,
        kind: r.kind,
        signature: `${r.name}(${r.identity_args})`,
        args: r.args,
        returns: r.returns,
        language: r.language,
        comment: r.comment,
        definition: r.definition.trim(),
      }),
    ),
    triggers: triggers.map(
      (t): DbTrigger => ({
        name: t.name,
        table: t.table,
        ...pgTriggerKind(Number(t.tgtype)),
        enabled: t.enabled !== 'D',
        routine: t.routine_schema === schema ? t.routine : `${t.routine_schema}.${t.routine}`,
        definition: t.definition,
      }),
    ),
  }
}

const MYSQL_ROUTINES_SQL = `
SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind, DTD_IDENTIFIER AS returns,
       EXTERNAL_LANGUAGE AS language, ROUTINE_COMMENT AS comment
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = ?
ORDER BY ROUTINE_NAME`

const MYSQL_PARAMS_SQL = `
SELECT SPECIFIC_NAME AS name, PARAMETER_MODE AS mode, PARAMETER_NAME AS param, DTD_IDENTIFIER AS type
FROM information_schema.PARAMETERS
WHERE SPECIFIC_SCHEMA = ? AND ORDINAL_POSITION > 0
ORDER BY SPECIFIC_NAME, ORDINAL_POSITION`

const MYSQL_TRIGGERS_SQL = `
SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS \`table\`, ACTION_TIMING AS timing,
       EVENT_MANIPULATION AS event, ACTION_ORIENTATION AS orientation
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = ?
ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`

const quoteMy = (name: string): string => `\`${name.replace(/`/g, '``')}\``

export async function routinesMysql(query: QueryFn, schema: string): Promise<RoutinesSnapshot> {
  const [routineRows, paramRows, triggerRows] = await Promise.all([
    query<{ name: string; kind: string; returns: string | null; language: string | null; comment: string | null }>(
      MYSQL_ROUTINES_SQL,
      [schema],
    ),
    query<{ name: string; mode: string | null; param: string; type: string }>(MYSQL_PARAMS_SQL, [schema]),
    query<{ name: string; table: string; timing: string; event: string; orientation: string }>(
      MYSQL_TRIGGERS_SQL,
      [schema],
    ),
  ])
  const params = new Map<string, string[]>()
  for (const p of paramRows) {
    const list = params.get(p.name) ?? []
    list.push(`${p.mode && p.mode !== 'IN' ? `${p.mode} ` : ''}${p.param} ${p.type}`)
    params.set(p.name, list)
  }

  const routines = await Promise.all(
    routineRows.map(async (r): Promise<DbRoutine> => {
      const kind = r.kind === 'PROCEDURE' ? 'procedure' : 'function'
      const [shown] = await query<Record<string, string | null>>(
        `SHOW CREATE ${kind.toUpperCase()} ${quoteMy(schema)}.${quoteMy(r.name)}`,
      )
      const args = (params.get(r.name) ?? []).join(', ')
      return {
        name: r.name,
        kind,
        signature: `${r.name}(${args})`,
        args,
        returns: kind === 'function' ? r.returns : null,
        language: r.language ?? 'SQL',
        comment: r.comment || null,
        definition: String(shown?.[`Create ${kind === 'function' ? 'Function' : 'Procedure'}`] ?? '').trim(),
      }
    }),
  )

  // One row per event: a trigger is unique per (timing, event) in MySQL, so names do not repeat.
  const triggers = await Promise.all(
    triggerRows.map(async (t): Promise<DbTrigger> => {
      const [shown] = await query<Record<string, string | null>>(`SHOW CREATE TRIGGER ${quoteMy(schema)}.${quoteMy(t.name)}`)
      return {
        name: t.name,
        table: t.table,
        timing: t.timing as TriggerTiming,
        events: [t.event as TriggerEvent],
        orientation: t.orientation === 'STATEMENT' ? 'statement' : 'row',
        enabled: true,
        routine: null,
        definition: String(shown?.['SQL Original Statement'] ?? '').trim(),
      }
    }),
  )
  return { routines, triggers }
}

/** Parses `CREATE TRIGGER name BEFORE|AFTER|INSTEAD OF INSERT|UPDATE [OF cols]|DELETE ON table`. */
export function parseSqliteTrigger(sql: string): Pick<DbTrigger, 'timing' | 'events'> {
  const m = /^\s*create\s+(?:temp(?:orary)?\s+)?trigger\s+(?:if\s+not\s+exists\s+)?(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w.]+)\s+(before|after|instead\s+of)?\s*(insert|update|delete)/i.exec(
    sql,
  )
  const timing = (m?.[1] ?? 'BEFORE').replace(/\s+/g, ' ').toUpperCase() as TriggerTiming
  const event = (m?.[2] ?? 'INSERT').toUpperCase() as TriggerEvent
  return { timing, events: [event] }
}

export async function routinesSqlite(query: QueryFn, schema: string): Promise<RoutinesSnapshot> {
  const rows = await query<{ name: string; tbl_name: string; sql: string | null }>(
    `SELECT name, tbl_name, sql FROM ${quoteIdent(schema)}.sqlite_schema WHERE type = 'trigger' ORDER BY tbl_name, name`,
  )
  return {
    routines: [],
    triggers: rows.map(
      (r): DbTrigger => ({
        name: r.name,
        table: r.tbl_name,
        ...parseSqliteTrigger(r.sql ?? ''),
        orientation: 'row',
        enabled: true,
        routine: null,
        definition: (r.sql ?? '').trim(),
      }),
    ),
  }
}
