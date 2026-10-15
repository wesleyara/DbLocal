import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('saved_queries').addColumn('folder', 'text').execute()
  await db.schema
    .createIndex('query_history_executed_idx')
    .on('query_history')
    .columns(['executed_at'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('query_history_executed_idx').execute()
  await db.schema.alterTable('saved_queries').dropColumn('folder').execute()
}
