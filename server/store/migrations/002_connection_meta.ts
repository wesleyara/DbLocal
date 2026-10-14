import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('connections')
    .addColumn('default_schema', 'text')
    .execute()
  await db.schema
    .alterTable('connections')
    .addColumn('last_used_at', 'text')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('connections').dropColumn('default_schema').execute()
  await db.schema.alterTable('connections').dropColumn('last_used_at').execute()
}
