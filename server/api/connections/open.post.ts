import { z } from 'zod'
import { connectionNameFor, ConnectionStringError, detectDialect, parseConnectionString } from '#shared/connection-string'
import { connectionCreateSchema } from '#shared/schemas/connection'
import { parseBody, run } from '../../connections/http'
import { createConnection, listConnections } from '../../connections/repository'
import { useStore } from '../../store/db'

const bodySchema = z.object({
  connectionString: z.string().trim().min(1).max(4096),
  name: z.string().trim().min(1).max(120).optional(),
  readonly: z.boolean().optional(),
})

/**
 * Used by the `dblocal <connection-string>` CLI: saves the connection (once) and returns it, so the
 * browser can open straight into it. Calling it again with the same string reuses the saved row.
 */
export default defineEventHandler(async (event) => {
  const body = parseBody(bodySchema, await readBody(event))
  return run(async () => {
    let input
    try {
      const dialect = detectDialect(body.connectionString)
      const parsed = parseConnectionString(dialect, body.connectionString)
      input = connectionCreateSchema.parse({
        name: body.name ?? connectionNameFor(dialect, parsed),
        dialect,
        host: parsed.host ?? null,
        port: parsed.port,
        user: parsed.user,
        password: parsed.password ?? null,
        database: parsed.database,
        filePath: parsed.filePath ?? null,
        ssl: { mode: parsed.sslMode ?? 'disable' },
        readonly: body.readonly ?? false,
        environment: 'local',
      })
    } catch (err) {
      if (err instanceof ConnectionStringError) {
        throw createError({ statusCode: 400, statusMessage: err.message })
      }
      throw err
    }
    const db = useStore()
    const existing = (await listConnections(db)).find(
      (c) =>
        c.name === input.name &&
        c.dialect === input.dialect &&
        (c.host ?? null) === (input.host ?? null) &&
        (c.database ?? null) === (input.database ?? null) &&
        (c.filePath ?? null) === (input.filePath ?? null) &&
        (c.user ?? null) === (input.user ?? null),
    )
    return existing ?? createConnection(db, input)
  })
})
