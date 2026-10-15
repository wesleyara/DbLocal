import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { ConnectionCreateInput, ConnectionTestInput, ConnectionUpdateInput } from '#shared/schemas/connection'
import type { ConnectionView, Dialect, SshAuthMethod, SslMode } from '#shared/types/connection'
import type { StoreSchema } from '../store/db'
import { decryptSecret, encryptSecret } from '../utils/secrets'
import { globalReadonly } from '../utils/readonly'
import { buildDriverConfig } from './config'

type Db = Kysely<StoreSchema>
type Row = StoreSchema['connections']

/** Secrets are stored as `v1:` ciphertext in `config.secrets` and are never returned by the API. */
type SecretKey = 'password' | 'sslCa' | 'sslCert' | 'sslKey' | 'sshPassword' | 'sshPrivateKey' | 'sshPassphrase'

interface StoredConfig {
  host: string | null
  port: number | null
  user: string | null
  database: string | null
  filePath: string | null
  ssl: { mode: SslMode }
  ssh: { enabled: boolean; host: string | null; port: number | null; user: string | null; authMethod: SshAuthMethod }
  secrets: Partial<Record<SecretKey, string>>
  /** The built-in demo database (`server/demo`): reset and "demo" badge apply to it only. */
  demo?: boolean
}

export class ConnectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Connection ${id} not found`)
    this.name = 'ConnectionNotFoundError'
  }
}

const EMPTY_CONFIG: StoredConfig = {
  host: null,
  port: null,
  user: null,
  database: null,
  filePath: null,
  ssl: { mode: 'disable' },
  ssh: { enabled: false, host: null, port: null, user: null, authMethod: 'password' },
  secrets: {},
}

function readConfig(row: Row): StoredConfig {
  return { ...EMPTY_CONFIG, ...(JSON.parse(row.config) as Partial<StoredConfig>) }
}

export function toView(row: Row): ConnectionView {
  const c = readConfig(row)
  return {
    id: row.id,
    name: row.name,
    dialect: row.dialect as Dialect,
    host: c.host,
    port: c.port,
    user: c.user,
    database: c.database,
    filePath: c.filePath,
    environment: row.environment as ConnectionView['environment'],
    color: (row.color as ConnectionView['color']) ?? null,
    readonly: row.readonly === 1,
    readonlyGlobal: globalReadonly(),
    defaultSchema: row.default_schema,
    hasPassword: Boolean(c.secrets.password),
    ssl: {
      mode: c.ssl.mode,
      hasCa: Boolean(c.secrets.sslCa),
      hasCert: Boolean(c.secrets.sslCert),
      hasKey: Boolean(c.secrets.sslKey),
    },
    ssh: {
      enabled: c.ssh.enabled,
      host: c.ssh.host,
      port: c.ssh.port,
      user: c.ssh.user,
      authMethod: c.ssh.authMethod,
      hasPassword: Boolean(c.secrets.sshPassword),
      hasPrivateKey: Boolean(c.secrets.sshPrivateKey),
      hasPassphrase: Boolean(c.secrets.sshPassphrase),
    },
    demo: c.demo === true,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Decrypts a stored config into the draft the driver config builder expects. */
function draftFrom(dialect: Dialect, c: StoredConfig): ConnectionTestInput {
  const plain = (key: SecretKey) => (c.secrets[key] ? decryptSecret(c.secrets[key]) : undefined)
  return {
    dialect,
    host: c.host ?? undefined,
    port: c.port ?? undefined,
    user: c.user ?? undefined,
    password: plain('password'),
    database: c.database ?? undefined,
    filePath: c.filePath ?? undefined,
    ssl: { mode: c.ssl.mode, ca: plain('sslCa'), cert: plain('sslCert'), key: plain('sslKey') },
    ssh: c.ssh.enabled
      ? {
          enabled: true,
          host: c.ssh.host ?? undefined,
          port: c.ssh.port ?? undefined,
          user: c.ssh.user ?? undefined,
          authMethod: c.ssh.authMethod,
          password: plain('sshPassword'),
          privateKey: plain('sshPrivateKey'),
          passphrase: plain('sshPassphrase'),
        }
      : undefined,
  }
}

/**
 * Secret rule: `undefined` keeps the current ciphertext, `null` or an empty string removes it,
 * and a string is encrypted and replaces it.
 */
function nextSecret(current: string | undefined, incoming: string | null | undefined): string | undefined {
  if (incoming === undefined) return current
  if (incoming === null || incoming === '') return undefined
  return encryptSecret(incoming)
}

function applySecrets(
  current: StoredConfig['secrets'],
  secrets: {
    password?: string | null
    ssl?: { ca?: string | null; cert?: string | null; key?: string | null }
    ssh?: { password?: string | null; privateKey?: string | null; passphrase?: string | null }
  },
): StoredConfig['secrets'] {
  const pairs: [SecretKey, string | null | undefined][] = [
    ['password', secrets.password],
    ['sslCa', secrets.ssl?.ca],
    ['sslCert', secrets.ssl?.cert],
    ['sslKey', secrets.ssl?.key],
    ['sshPassword', secrets.ssh?.password],
    ['sshPrivateKey', secrets.ssh?.privateKey],
    ['sshPassphrase', secrets.ssh?.passphrase],
  ]
  const next: StoredConfig['secrets'] = {}
  for (const [key, incoming] of pairs) {
    const value = nextSecret(current[key], incoming)
    if (value !== undefined) next[key] = value
  }
  return next
}

export async function listConnections(db: Db): Promise<ConnectionView[]> {
  const rows = await db
    .selectFrom('connections')
    .selectAll()
    .orderBy('last_used_at', 'desc')
    .orderBy('name')
    .execute()
  return rows.map(toView)
}

export async function getConnectionRow(db: Db, id: string): Promise<Row> {
  const row = await db.selectFrom('connections').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) throw new ConnectionNotFoundError(id)
  return row
}

export async function getConnection(db: Db, id: string): Promise<ConnectionView> {
  return toView(await getConnectionRow(db, id))
}

export async function createConnection(db: Db, input: ConnectionCreateInput): Promise<ConnectionView> {
  // Validates the input the same way a test would, so an invalid connection is never saved.
  buildDriverConfig(input)
  const stored: StoredConfig = {
    host: input.host ?? null,
    port: input.port ?? null,
    user: input.user ?? null,
    database: input.database ?? null,
    filePath: input.filePath ?? null,
    ssl: { mode: input.ssl.mode },
    ssh: {
      enabled: input.ssh?.enabled ?? false,
      host: input.ssh?.host ?? null,
      port: input.ssh?.port ?? null,
      user: input.ssh?.user ?? null,
      authMethod: input.ssh?.authMethod ?? 'password',
    },
    secrets: applySecrets(EMPTY_CONFIG.secrets, { password: input.password, ssl: input.ssl, ssh: input.ssh }),
  }
  const id = randomUUID()
  const now = new Date().toISOString()
  await db
    .insertInto('connections')
    .values({
      id,
      name: input.name,
      dialect: input.dialect,
      config: JSON.stringify(stored),
      environment: input.environment,
      color: input.color ?? null,
      readonly: input.readonly ? 1 : 0,
      default_schema: input.defaultSchema ?? null,
      last_used_at: null,
      created_at: now,
      updated_at: now,
    })
    .execute()
  return getConnection(db, id)
}

/**
 * Applies a PATCH. Fields absent from the patch keep their stored value. The result is validated
 * before anything is written, so a PATCH cannot leave a connection that cannot be built.
 */
export async function updateConnection(
  db: Db,
  id: string,
  patch: ConnectionUpdateInput,
): Promise<ConnectionView> {
  const row = await getConnectionRow(db, id)
  const current = readConfig(row)
  const dialect = (patch.dialect ?? row.dialect) as Dialect

  const next: StoredConfig = {
    host: pick(patch.host, current.host),
    port: pick(patch.port, current.port),
    user: pick(patch.user, current.user),
    database: pick(patch.database, current.database),
    filePath: pick(patch.filePath, current.filePath),
    ssl: patch.ssl ? { mode: patch.ssl.mode } : current.ssl,
    ssh: patch.ssh
      ? {
          enabled: patch.ssh.enabled,
          host: pick(patch.ssh.host, current.ssh.host),
          port: pick(patch.ssh.port, current.ssh.port),
          user: pick(patch.ssh.user, current.ssh.user),
          authMethod: patch.ssh.authMethod,
        }
      : current.ssh,
    secrets: applySecrets(current.secrets, { password: patch.password, ssl: patch.ssl, ssh: patch.ssh }),
    ...(current.demo ? { demo: true } : {}),
  }

  buildDriverConfig({ ...draftFrom(dialect, next), dialect }, id)

  await db
    .updateTable('connections')
    .set({
      name: patch.name ?? row.name,
      dialect,
      config: JSON.stringify(next),
      environment: patch.environment ?? row.environment,
      color: pick(patch.color, row.color),
      readonly: patch.readonly === undefined ? row.readonly : patch.readonly ? 1 : 0,
      default_schema: pick(patch.defaultSchema, row.default_schema),
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', id)
    .execute()
  return getConnection(db, id)
}

/** `undefined` keeps the current value; `null` clears it; anything else replaces it. */
function pick<T>(incoming: T | null | undefined, current: T | null): T | null {
  if (incoming === undefined) return current
  return incoming ?? null
}

export async function deleteConnection(db: Db, id: string): Promise<void> {
  await getConnectionRow(db, id)
  await db.deleteFrom('connections').where('id', '=', id).execute()
}

/** Copies a connection with its ciphertext as is. The copy gets a new id and a "(copy)" name. */
export async function duplicateConnection(db: Db, id: string): Promise<ConnectionView> {
  const row = await getConnectionRow(db, id)
  const copyId = randomUUID()
  const now = new Date().toISOString()
  // A copy of the demo is an ordinary connection: it is not the one "Reset demo" restores.
  const config = JSON.stringify({ ...readConfig(row), demo: undefined })
  await db
    .insertInto('connections')
    .values({ ...row, id: copyId, name: `${row.name} (copy)`, config, last_used_at: null, created_at: now, updated_at: now })
    .execute()
  return getConnection(db, copyId)
}

/** The saved demo connection, if the user has opened the demo database before. */
export async function findDemoConnection(db: Db): Promise<ConnectionView | null> {
  const rows = await db.selectFrom('connections').selectAll().execute()
  const row = rows.find((r) => readConfig(r).demo === true)
  return row ? toView(row) : null
}

/** Creates the demo connection for a SQLite file and flags it (the flag lives in `config`). */
export async function createDemoConnection(db: Db, filePath: string, name: string): Promise<ConnectionView> {
  const created = await createConnection(db, {
    name,
    dialect: 'sqlite',
    filePath,
    ssl: { mode: 'disable' },
    environment: 'local',
    color: 'accent',
    readonly: false,
    defaultSchema: 'main',
  })
  const row = await getConnectionRow(db, created.id)
  await db
    .updateTable('connections')
    .set({ config: JSON.stringify({ ...readConfig(row), demo: true }) })
    .where('id', '=', created.id)
    .execute()
  return getConnection(db, created.id)
}

export async function markUsed(db: Db, id: string): Promise<void> {
  await db
    .updateTable('connections')
    .set({ last_used_at: new Date().toISOString() })
    .where('id', '=', id)
    .execute()
}

/** Decrypted draft for a saved connection, used by connect and by the driver pool. */
export async function loadDraft(db: Db, id: string): Promise<ConnectionTestInput> {
  const row = await getConnectionRow(db, id)
  return draftFrom(row.dialect as Dialect, readConfig(row))
}
