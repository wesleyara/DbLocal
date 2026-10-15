import { z } from 'zod'

export const dialectSchema = z.enum(['postgres', 'mysql', 'sqlite'])
export const environmentSchema = z.enum(['local', 'staging', 'prod'])
export const sslModeSchema = z.enum(['disable', 'require', 'verify-ca', 'verify-full'])
export const colorSchema = z.enum(['accent', 'success', 'warning', 'danger', 'neutral'])

/**
 * Secret fields: `undefined` keeps the stored value on update, `null` removes it, a string replaces it.
 * On create, `undefined` and `null` both mean "not set".
 */
const secret = z.string().nullable().optional()

const sslSchema = z
  .object({
    mode: sslModeSchema.default('disable'),
    ca: secret,
    cert: secret,
    key: secret,
  })
  .default({ mode: 'disable' })

const sshSchema = z
  .object({
    enabled: z.boolean().default(false),
    host: z.string().trim().min(1).nullable().optional(),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    user: z.string().nullable().optional(),
    authMethod: z.enum(['password', 'key']).default('password'),
    password: secret,
    privateKey: secret,
    passphrase: secret,
  })
  .optional()

/** Connection config as typed in the form or pasted as a string. Used by the "Test connection" button. */
export const connectionTestSchema = z.object({
  /** When set, secrets that are not sent are taken from the saved connection (edit form). */
  connectionId: z.string().optional(),
  dialect: dialectSchema,
  connectionString: z.string().trim().min(1).optional(),
  host: z.string().trim().min(1).nullable().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().optional(),
  password: secret,
  database: z.string().optional(),
  filePath: z.string().trim().min(1).nullable().optional(),
  ssl: sslSchema,
  ssh: sshSchema,
})

export type ConnectionTestInput = z.infer<typeof connectionTestSchema>

/** Body of `POST /api/connections`. The connection string is a form helper and is not stored. */
export const connectionCreateSchema = connectionTestSchema.omit({ connectionString: true, connectionId: true }).extend({
  name: z.string().trim().min(1).max(120),
  environment: environmentSchema.default('local'),
  color: colorSchema.nullable().optional(),
  readonly: z.boolean().default(false),
  defaultSchema: z.string().trim().min(1).nullable().optional(),
})

export type ConnectionCreateInput = z.infer<typeof connectionCreateSchema>

/** Body of `PATCH /api/connections/:id`: every field optional. */
export const connectionUpdateSchema = connectionCreateSchema.partial()

export type ConnectionUpdateInput = z.infer<typeof connectionUpdateSchema>
