/** A row or count request that does not match the live schema. Mapped to HTTP by `run()`. */
export class QueryInputError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message)
    this.name = 'QueryInputError'
  }
}

/**
 * One operation of a mutation batch failed. The transaction was rolled back; `index` is the
 * position of the operation in the request, so the UI can mark the row or cell that caused it.
 */
export class MutationFailedError extends Error {
  constructor(
    readonly index: number,
    readonly code: 'auth' | 'network' | 'timeout' | 'syntax' | 'constraint' | 'permission' | 'unknown',
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MutationFailedError'
  }
}

/** A write or DDL statement on a `prod` connection was sent without `confirmWrites`. Mapped to 409. */
export class ConfirmationRequiredError extends Error {
  constructor(readonly kinds: string[]) {
    super('This connection is marked as production: confirm before running writes or DDL')
    this.name = 'ConfirmationRequiredError'
  }
}
