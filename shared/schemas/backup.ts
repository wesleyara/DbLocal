import { z } from 'zod'

export const dumpRequestSchema = z.object({
  schema: z.string().min(1).optional(),
  tables: z.array(z.string().min(1)).max(10_000).optional(),
  structure: z.boolean().default(true),
  data: z.boolean().default(true),
})

export const workspaceExportSchema = z.object({
  /** Encrypts the connection secrets; without it they are left out. */
  password: z.string().min(8).max(1000).optional(),
  history: z.boolean().default(false),
})

export const workspaceImportSchema = z.object({
  backup: z.object({
    format: z.literal('dblocal-workspace'),
    version: z.literal(1),
    createdAt: z.string(),
    kdf: z
      .object({ name: z.literal('scrypt'), salt: z.string(), N: z.number().int(), r: z.number().int(), p: z.number().int(), check: z.string() })
      .nullable(),
    connections: z.array(z.record(z.string(), z.unknown())),
    savedQueries: z.array(z.record(z.string(), z.unknown())),
    virtualRelations: z.array(z.record(z.string(), z.unknown())),
    preferences: z.array(z.object({ key: z.string(), value: z.string() })),
    history: z.array(z.record(z.string(), z.unknown())).nullable(),
  }),
  password: z.string().max(1000).optional(),
})
