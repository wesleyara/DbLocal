import { describe, expect, it } from 'vitest'
import { parseMysqlJsonPlan, parseMysqlTextPlan, parsePostgresPlan, parseSqlitePlan } from './explain'

describe('postgres plan', () => {
  it('builds the tree with cost, rows and analyzed time', () => {
    const plan = parsePostgresPlan([
      {
        Plan: {
          'Node Type': 'Hash Join',
          'Total Cost': 40.5,
          'Plan Rows': 10,
          'Actual Rows': 8,
          'Actual Total Time': 1.5,
          'Actual Loops': 1,
          'Hash Cond': '(o.user_id = u.id)',
          Plans: [
            { 'Node Type': 'Seq Scan', 'Relation Name': 'orders', Alias: 'o', 'Total Cost': 20, 'Plan Rows': 50 },
            { 'Node Type': 'Index Scan', 'Relation Name': 'users', 'Index Name': 'users_pkey', 'Total Cost': 5, 'Plan Rows': 1 },
          ],
        },
      },
    ])
    expect(plan?.label).toBe('Hash Join')
    expect(plan?.cost).toBe(40.5)
    expect(plan?.rows).toBe(8)
    expect(plan?.timeMs).toBe(1.5)
    expect(plan?.children.map((c) => c.label)).toEqual(['Seq Scan', 'Index Scan'])
    expect(plan?.children[0]?.detail).toBe('orders as o')
    expect(plan?.children[1]?.detail).toBe('users · index users_pkey')
  })

  it('returns null for something that is not a plan', () => {
    expect(parsePostgresPlan({})).toBeNull()
    expect(parsePostgresPlan(null)).toBeNull()
  })
})

describe('mysql plans', () => {
  it('reads the JSON query block', () => {
    const plan = parseMysqlJsonPlan({
      query_block: {
        cost_info: { query_cost: '2.40' },
        table: { table_name: 'users', access_type: 'ALL', rows_examined_per_scan: 3, cost_info: { prefix_cost: '0.55' } },
      },
    })
    expect(plan?.cost).toBe(2.4)
    expect(plan?.children[0]).toMatchObject({ label: 'full scan', rows: 3, detail: 'users' })
  })

  it('reads the EXPLAIN ANALYZE text tree', () => {
    const text = [
      '-> Nested loop inner join  (cost=2.1 rows=3) (actual time=0.05..0.2 rows=3 loops=1)',
      '    -> Table scan on o  (cost=0.5 rows=3) (actual time=0.02..0.04 rows=3 loops=1)',
      '    -> Single-row index lookup on u using PRIMARY (id=o.user_id)  (cost=0.3 rows=1) (actual time=0.01..0.01 rows=1 loops=3)',
    ].join('\n')
    const plan = parseMysqlTextPlan(text)
    expect(plan?.label).toBe('Nested loop inner join')
    expect(plan?.timeMs).toBeCloseTo(0.2)
    expect(plan?.children).toHaveLength(2)
    expect(plan?.children[1]?.timeMs).toBeCloseTo(0.03)
  })
})

describe('sqlite plan', () => {
  it('nests rows by parent id', () => {
    const plan = parseSqlitePlan([
      { id: 2, parent: 0, detail: 'SCAN o' },
      { id: 5, parent: 2, detail: 'SEARCH u USING INTEGER PRIMARY KEY (rowid=?)' },
    ])
    expect(plan?.label).toBe('SCAN o')
    expect(plan?.children[0]?.label).toBe('SEARCH u')
    expect(plan?.children[0]?.detail).toBe('USING INTEGER PRIMARY KEY (rowid=?)')
  })

  it('wraps several roots', () => {
    const plan = parseSqlitePlan([
      { id: 1, parent: 0, detail: 'SCAN a' },
      { id: 2, parent: 0, detail: 'SCAN b' },
    ])
    expect(plan?.label).toBe('Query plan')
    expect(plan?.children).toHaveLength(2)
  })
})
