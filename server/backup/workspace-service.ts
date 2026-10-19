import { randomBytes, scryptSync } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { WorkspaceBackup, WorkspaceImportResult } from '#shared/types/backup'
import { getPoolManager } from '../drivers'
import { invalidateSchema } from '../schema/service'
import type { StoreSchema } from '../store/db'
import { decrypt, encrypt } from '../utils/crypto'
import { decryptSecret, encryptSecret } from '../utils/secrets'

type Db = Kysely<StoreSchema>

/** scrypt cost: about 50 ms, once per export or import. */
const SCRYPT = { N: 16384, r: 8, p: 1 }
/** Encrypted with the password key; decrypting it tells a wrong password apart from a broken file. */
const CHECK = 'dblocal-workspace'

export class WorkspaceBackupError extends Error {
  constructor(
    readonly code: 'password' | 'invalid',
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceBackupError'
  }
}

const deriveKey = (password: string, salt: Buffer, params: typeof SCRYPT) =>
  scryptSync(password, salt, 32, { ...params, maxmem: 64 * 1024 * 1024 })

/** Applies `fn` to every `v1:` secret of a connection row's config. */
function mapSecrets(row: Record<string, unknown>, fn: ((value: string) => string) | null): Record<string, unknown> {
  const config = JSON.parse(String(row.config)) as { secrets?: Record<string, string> }
  config.secrets = fn ? Object.fromEntries(Object.entries(config.secrets ?? {}).map(([k, v]) => [k, fn(v)])) : {}
  return { ...row, config: JSON.stringify(config) }
}

/**
 * Everything DbLocal keeps about the user's work: connections, saved queries, virtual relations
 * and preferences (grid layouts, notes, ERD layouts), plus the history when asked. Secrets leave
 * the local `secret.key` behind: they are encrypted again with a key derived from `password`
 * (scrypt + AES-256-GCM), or dropped when there is no password.
 */
export async function exportWorkspace(db: Db, req: { password?: string; history: boolean }): Promise<WorkspaceBackup> {
  let kdf: WorkspaceBackup['kdf'] = null
  let key: Buffer | null = null
  if (req.password) {
    const salt = randomBytes(16)
    key = deriveKey(req.password, salt, SCRYPT)
    kdf = { name: 'scrypt', salt: salt.toString('base64'), ...SCRYPT, check: encrypt(CHECK, key) }
  }
  const connections = await db.selectFrom('connections').selectAll().execute()
  return {
    format: 'dblocal-workspace',
    version: 1,
    createdAt: new Date().toISOString(),
    kdf,
    connections: connections.map((c) => mapSecrets(c, key ? (v) => encrypt(decryptSecret(v), key) : null)),
    savedQueries: await db.selectFrom('saved_queries').selectAll().execute(),
    virtualRelations: await db.selectFrom('virtual_relations').selectAll().execute(),
    preferences: await db.selectFrom('preferences').selectAll().execute(),
    history: req.history ? await db.selectFrom('query_history').selectAll().orderBy('id').execute() : null,
  }
}

const pick = <T extends string>(row: Record<string, unknown>, keys: readonly T[]) =>
  Object.fromEntries(keys.map((k) => [k, row[k] ?? null])) as Record<T, unknown>

const CONNECTION_COLUMNS = ['id', 'name', 'dialect', 'config', 'environment', 'color', 'readonly', 'default_schema', 'last_used_at', 'created_at', 'updated_at'] as const
const SAVED_QUERY_COLUMNS = ['id', 'connection_id', 'name', 'sql', 'folder', 'created_at', 'updated_at'] as const
const VIRTUAL_COLUMNS = ['id', 'connection_id', 'schema_name', 'definition', 'created_at'] as const
const HISTORY_COLUMNS = ['connection_id', 'sql', 'duration_ms', 'row_count', 'status', 'error', 'executed_at'] as const

/**
 * Restores a workspace backup into this store, merging: rows with the same id (connections,
 * saved queries, virtual relations) or key (preferences) are replaced, the rest are added. History
 * entries are appended. Secrets are decrypted with the backup's password and encrypted again with
 * this installation's key, all in one transaction.
 */
export async function importWorkspace(db: Db, backup: WorkspaceBackup, password?: string): Promise<WorkspaceImportResult> {
  let key: Buffer | null = null
  if (backup.kdf) {
    if (!password) throw new WorkspaceBackupError('password', 'This backup is protected by a password')
    const { salt, N, r, p, check } = backup.kdf
    key = deriveKey(password, Buffer.from(salt, 'base64'), { N, r, p })
    try {
      if (decrypt(check, key) !== CHECK) throw new Error('check')
    } catch {
      throw new WorkspaceBackupError('password', 'Wrong password for this backup')
    }
  }
  let withoutSecrets = 0
  const connections = backup.connections.map((row) => {
    if (typeof row.id !== 'string' || typeof row.config !== 'string') throw new WorkspaceBackupError('invalid', 'The backup has an invalid connection')
    // Without a password nothing secret travelled: server connections need theirs typed again.
    const config = JSON.parse(row.config) as { host?: string | null }
    if (!key && (row.dialect !== 'sqlite' || config.host)) withoutSecrets++
    return pick(key ? mapSecrets(row, (v) => encryptSecret(decrypt(v, key!))) : row, CONNECTION_COLUMNS)
  })

  await db.transaction().execute(async (trx) => {
    for (const c of connections) {
      // Updated in place: deleting would cascade to this installation's saved queries and history.
      const { numUpdatedRows } = await trx.updateTable('connections').set(c as never).where('id', '=', c.id as string).executeTakeFirst()
      if (numUpdatedRows === 0n) await trx.insertInto('connections').values(c as never).execute()
    }
    for (const q of backup.savedQueries.map((r) => pick(r, SAVED_QUERY_COLUMNS))) {
      await trx.deleteFrom('saved_queries').where('id', '=', q.id as string).execute()
      await trx.insertInto('saved_queries').values(q as never).execute()
    }
    for (const v of backup.virtualRelations.map((r) => pick(r, VIRTUAL_COLUMNS))) {
      await trx.deleteFrom('virtual_relations').where('id', '=', v.id as string).execute()
      await trx.insertInto('virtual_relations').values(v as never).execute()
    }
    for (const p of backup.preferences) {
      await trx.deleteFrom('preferences').where('key', '=', p.key).execute()
      await trx.insertInto('preferences').values(p).execute()
    }
    for (const h of (backup.history ?? []).map((r) => pick(r, HISTORY_COLUMNS))) {
      await trx.insertInto('query_history').values(h as never).execute()
    }
  })

  for (const c of connections) {
    await getPoolManager().invalidate(c.id as string)
    invalidateSchema(c.id as string)
  }
  return {
    connections: connections.length,
    savedQueries: backup.savedQueries.length,
    virtualRelations: backup.virtualRelations.length,
    preferences: backup.preferences.length,
    history: backup.history?.length ?? 0,
    withoutSecrets,
  }
}
