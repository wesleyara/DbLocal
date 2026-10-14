import type { DriverErrorCode } from './types'

const STATUS: Record<DriverErrorCode, number> = {
  auth: 401,
  network: 502,
  timeout: 504,
  syntax: 400,
  constraint: 409,
  permission: 403,
  unknown: 500,
}

/** Normalised driver error. Drivers map their native errors to a code before throwing. */
export class DriverError extends Error {
  readonly code: DriverErrorCode
  override readonly cause?: unknown

  constructor(code: DriverErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'DriverError'
    this.code = code
    this.cause = cause
  }

  get httpStatus(): number {
    return STATUS[this.code]
  }
}

export function isDriverError(err: unknown): err is DriverError {
  return err instanceof DriverError
}

/** Node socket codes shared by every network-based driver. */
export const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
])

export function isTimeoutError(code: string | undefined, message: string): boolean {
  return code === 'ETIMEDOUT' || /timeout/i.test(message)
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
