import type { ZodType } from 'zod'
import { DriverError, isDriverError } from '../drivers/errors'
import { ConfirmationRequiredError, MutationFailedError, QueryInputError } from '../query/errors'
import { WorkspaceBackupError } from '../backup/workspace-service'
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
    if (err instanceof MutationFailedError) {
      const status = new DriverError(err.code, err.message).httpStatus
      // The database message goes in `data`: the status line must stay ASCII.
      throw createError({
        statusCode: status,
        statusMessage: 'Mutation failed',
        data: { code: err.code, errors: [{ index: err.index, code: err.code, message: err.message }] },
      })
    }
    if (isDriverError(err)) {
      throw createError({ statusCode: err.httpStatus, statusMessage: err.message, data: { code: err.code } })
    }
    if (err instanceof ConfirmationRequiredError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Confirmation required',
        data: { code: 'confirmation_required', kinds: err.kinds },
      })
    }
    if (err instanceof WorkspaceBackupError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid backup', data: { code: err.code, message: err.message } })
    }
    if (err instanceof QueryInputError) {
      // The message goes in `data`: the status line must stay ASCII, column names may not be.
      throw createError({ statusCode: err.status, statusMessage: 'Invalid request', data: { message: err.message } })
    }
    throw err
  }
}
