import type { ZodType } from 'zod'
import { isDriverError } from '../drivers/errors'
import { ConnectionNotFoundError } from './repository'

/** Validates a request body. Invalid input becomes a 400 carrying the zod issues. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  return parsed.data
}

/**
 * Runs a connection route. Not-found becomes 404, a DriverError becomes its HTTP status with the
 * normalised `code` in `data`, and anything else is re-thrown.
 */
export async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ConnectionNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
    }
    if (isDriverError(err)) {
      throw createError({ statusCode: err.httpStatus, statusMessage: err.message, data: { code: err.code } })
    }
    throw err
  }
}
