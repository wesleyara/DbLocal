import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('connections')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('dialect', 'text', (c) => c.notNull())
    .addColumn('config', 'text', (c) => c.notNull())
    .addColumn('environment', 'text', (c) => c.notNull().defaultTo('local'))
    .addColumn('color', 'text')
    .addColumn('readonly', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()

  await db.schema
    .createTable('saved_queries')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('connection_id', 'text', (c) =>
      c.references('connections.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('sql', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()

  await db.schema
    .createTable('query_history')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('connection_id', 'text', (c) =>
      c.references('connections.id').onDelete('cascade'),
    )
    .addColumn('sql', 'text', (c) => c.notNull())
    .addColumn('duration_ms', 'integer')
    .addColumn('row_count', 'integer')
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('error', 'text')
    .addColumn('executed_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()

  await db.schema
    .createTable('virtual_relations')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('connection_id', 'text', (c) =>
      c.notNull().references('connections.id').onDelete('cascade'),
    )
    .addColumn('schema_name', 'text', (c) => c.notNull())
    .addColumn('definition', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()

  await db.schema
    .createTable('preferences')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('value', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('kv')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('value', 'text', (c) => c.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [
    'kv',
    'preferences',
    'virtual_relations',
    'query_history',
    'saved_queries',
    'connections',
  ]) {
    await db.schema.dropTable(t).execute()
  }
}
