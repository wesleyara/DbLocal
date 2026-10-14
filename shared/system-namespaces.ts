import type { Dialect } from './types/connection'

/** Namespaces the database creates for itself. The UI hides them unless the user asks to see them. */
const SYSTEM: Record<Dialect, string[]> = {
  postgres: ['pg_catalog', 'information_schema', 'pg_toast'],
  mysql: ['information_schema', 'mysql', 'performance_schema', 'sys'],
  sqlite: [],
}

export function isSystemNamespace(dialect: Dialect, name: string): boolean {
  return SYSTEM[dialect].includes(name) || name.startsWith('pg_temp') || name.startsWith('pg_toast_temp')
}
