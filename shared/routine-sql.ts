import type { DbRoutine, DbTrigger } from './types/routines'

export type RoutineDialect = 'postgres' | 'mysql' | 'sqlite'
export type NewKind = 'function' | 'procedure' | 'trigger'

const quote = (dialect: RoutineDialect, name: string): string =>
  dialect === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`

const qualified = (dialect: RoutineDialect, schema: string, name: string): string =>
  `${quote(dialect, schema)}.${quote(dialect, name)}`

const terminated = (sql: string): string => {
  const trimmed = sql.trim()
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`
}

/** What the dialect can hold: SQLite has triggers only. */
export const supportedKinds = (dialect: RoutineDialect): NewKind[] =>
  dialect === 'sqlite' ? ['trigger'] : ['function', 'procedure', 'trigger']

/** `DROP ...` for a routine or trigger. Postgres routines carry their argument types (overloads). */
export function dropSql(dialect: RoutineDialect, schema: string, item: DbRoutine | DbTrigger): string {
  if ('table' in item) {
    if (dialect === 'postgres') {
      return `DROP TRIGGER IF EXISTS ${quote(dialect, item.name)} ON ${qualified(dialect, schema, item.table)};`
    }
    return `DROP TRIGGER IF EXISTS ${qualified(dialect, schema, item.name)};`
  }
  const keyword = item.kind === 'procedure' ? 'PROCEDURE' : 'FUNCTION'
  const args = dialect === 'postgres' ? item.signature.slice(item.name.length) : ''
  return `DROP ${keyword} IF EXISTS ${qualified(dialect, schema, item.name)}${args};`
}

/**
 * The script that replaces `original` with `definition`. Postgres routines are `CREATE OR
 * REPLACE`; everything else is dropped and created again, inside a transaction where the dialect
 * allows DDL in one (MySQL commits implicitly, so a failed CREATE leaves the object dropped).
 */
export function editScript(
  dialect: RoutineDialect,
  schema: string,
  original: DbRoutine | DbTrigger,
  definition: string,
): string {
  const isTrigger = 'table' in original
  if (dialect === 'postgres' && !isTrigger) return terminated(definition)
  const body = [dropSql(dialect, schema, original), terminated(definition)]
  return dialect === 'mysql' ? body.join('\n') : ['BEGIN;', ...body, 'COMMIT;'].join('\n')
}

export function toggleTriggerSql(schema: string, trigger: DbTrigger, enable: boolean): string {
  return `ALTER TABLE ${qualified('postgres', schema, trigger.table)} ${enable ? 'ENABLE' : 'DISABLE'} TRIGGER ${quote('postgres', trigger.name)};`
}

/** Starting point for a new object. `table` is the table of a new trigger. */
export function createTemplate(
  dialect: RoutineDialect,
  schema: string,
  kind: NewKind,
  table = 'table_name',
): string {
  if (dialect === 'postgres') {
    const s = quote(dialect, schema)
    if (kind === 'function') {
      return `CREATE OR REPLACE FUNCTION ${s}.new_function(arg integer)\nRETURNS integer\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  RETURN arg;\nEND;\n$$;`
    }
    if (kind === 'procedure') {
      return `CREATE OR REPLACE PROCEDURE ${s}.new_procedure(arg integer)\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  -- do something with arg\nEND;\n$$;`
    }
    return `CREATE OR REPLACE FUNCTION ${s}.new_trigger_fn()\nRETURNS trigger\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  RETURN NEW;\nEND;\n$$;\n\nCREATE TRIGGER new_trigger\nBEFORE INSERT OR UPDATE ON ${s}.${quote(dialect, table)}\nFOR EACH ROW EXECUTE FUNCTION ${s}.new_trigger_fn();`
  }
  if (dialect === 'mysql') {
    if (kind === 'function') {
      return 'CREATE FUNCTION new_function(arg INT)\nRETURNS INT\nDETERMINISTIC\nBEGIN\n  RETURN arg;\nEND;'
    }
    if (kind === 'procedure') {
      return 'CREATE PROCEDURE new_procedure(IN arg INT)\nBEGIN\n  SELECT arg;\nEND;'
    }
    return `CREATE TRIGGER new_trigger\nBEFORE INSERT ON ${quote(dialect, table)}\nFOR EACH ROW\nBEGIN\n  -- SET NEW.column = ...;\nEND;`
  }
  return `CREATE TRIGGER new_trigger\nAFTER INSERT ON ${quote(dialect, table)}\nFOR EACH ROW\nBEGIN\n  SELECT 1;\nEND;`
}
