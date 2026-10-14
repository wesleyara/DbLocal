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
