import { describe, expect, it } from 'vitest'
import type { RowsPlan } from '#shared/types/rows'
import { compileCount, compileRows, escapeLike } from './compile'

const plan = (over: Partial<RowsPlan> = {}): RowsPlan => ({
  dialect: 'postgres',
  schema: 'public',
  table: 'orders',
  primaryKey: ['id'],
  columns: null,
  filter: null,
  sort: [{ column: 'id', direction: 'asc' }],
  limit: 100,
  offset: 200,
  ...over,
})

const INJECTION = "x'; drop table orders; --"

describe('compileRows', () => {
  it('selects all columns from the qualified table with paging', () => {
    const q = compileRows(plan())
    expect(q.sql).toBe('select * from "public"."orders" order by "id" asc limit $1 offset $2')
    expect(q.parameters).toEqual([100, 200])
  })

  it('never interpolates values: the payload only appears as a parameter', () => {
    const q = compileRows(
      plan({ filter: { type: 'condition', column: 'note', op: 'eq', value: INJECTION } }),
    )
    expect(q.sql).not.toContain('drop table')
    expect(q.parameters).toContain(INJECTION)
  })

  it('uses ILIKE with an escape for contains on Postgres', () => {
    const q = compileRows(plan({ filter: { type: 'condition', column: 'note', op: 'contains', value: '50%_off' } }))
    expect(q.sql).toContain('"note" ilike $1 escape \'!\'')
    expect(q.parameters[0]).toBe('%50!%!_off%')
  })

  it('uses LOWER on both sides for contains on MySQL and SQLite', () => {
    for (const dialect of ['mysql', 'sqlite'] as const) {
      const q = compileRows(
        plan({ dialect, filter: { type: 'condition', column: 'note', op: 'contains', value: 'Ana' } }),
      )
      expect(q.sql).toContain("lower(`note`) like lower(?) escape '!'".replace(/`/g, dialect === 'mysql' ? '`' : '"'))
      expect(q.parameters).toContain('%Ana%')
    }
  })

  it('renders nested groups with the right glue and parentheses', () => {
    const q = compileRows(
      plan({
        filter: {
          type: 'group',
          logic: 'and',
          children: [
            { type: 'condition', column: 'id', op: 'gt', value: 5 },
            {
              type: 'group',
              logic: 'or',
              children: [
                { type: 'condition', column: 'note', op: 'is_null' },
                { type: 'condition', column: 'paid', op: 'is_true' },
              ],
            },
          ],
        },
      }),
    )
    expect(q.sql).toContain('where ("id" > $1 and ("note" is null or "paid" = $2))')
    expect(q.parameters).toEqual([5, true, 100, 200])
  })

  it('expands lists and ranges into placeholders', () => {
    const q = compileRows(
      plan({
        filter: { type: 'condition', column: 'id', op: 'in', value: [1, 2, 3] },
      }),
    )
    expect(q.sql).toContain('"id" in ($1, $2, $3)')
    const between = compileRows(
      plan({ filter: { type: 'condition', column: 'id', op: 'between', value: [1, 9] } }),
    )
    expect(between.sql).toContain('"id" between $1 and $2')
  })

  it('selects only the requested columns when given', () => {
    const q = compileRows(plan({ columns: ['id', 'note'] }))
    expect(q.sql.startsWith('select "id" as "id", "note" as "note" from')).toBe(true)
  })

  it('uses the dialect placeholders and quoting', () => {
    const mysql = compileRows(plan({ dialect: 'mysql', schema: 'shop', table: 'orders' }))
    expect(mysql.sql).toBe('select * from `shop`.`orders` order by `id` asc limit ? offset ?')
    const sqlite = compileRows(plan({ dialect: 'sqlite', schema: 'main' }))
    expect(sqlite.sql).toBe('select * from "main"."orders" order by "id" asc limit ? offset ?')
  })
})

describe('compileCount', () => {
  it('counts with the same filter and no paging', () => {
    const q = compileCount(plan({ filter: { type: 'condition', column: 'paid', op: 'is_false' } }))
    expect(q.sql).toBe('select count(*) as "count" from "public"."orders" where "paid" = $1')
    expect(q.parameters).toEqual([false])
  })
})

describe('escapeLike', () => {
  it('escapes the escape char and both wildcards', () => {
    expect(escapeLike('a!b%c_d')).toBe('a!!b!%c!_d')
  })
})
