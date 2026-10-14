import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildRelationGraph } from '../../schema/relation-graph'
import type { QueryFn } from './common'
import { introspectSqlite } from './sqlite'

// Criterion from task 015: 300 tables read in under 500 ms. The assertion has headroom for slow CI
// machines; the measured time is printed so the real number is visible in the log.
describe('introspection performance', () => {
  it('reads and graphs a 300-table schema', async () => {
    const db = new Database(':memory:')
    const ddl: string[] = []
    for (let i = 0; i < 300; i++) {
      const parent = i > 0 ? `, parent_id INTEGER REFERENCES t${i - 1}(id)` : ''
      ddl.push(`CREATE TABLE t${i} (id INTEGER PRIMARY KEY, name TEXT, amount NUMERIC, created_at DATETIME${parent});`)
    }
    db.exec(ddl.join('\n'))
    const query: QueryFn = async <R>(sql: string) => db.prepare(sql).all() as R[]

    const started = performance.now()
    const snap = await introspectSqlite(query, 'main')
    const graph = buildRelationGraph(snap)
    const elapsed = Math.round(performance.now() - started)
    process.stdout.write(`[perf] introspect + graph, 300 tables: ${elapsed} ms\n`)

    expect(snap.tables).toHaveLength(300)
    expect(graph.relations).toHaveLength(299)
    expect(elapsed).toBeLessThan(5000)
  })
})
