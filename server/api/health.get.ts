/** Liveness probe for the container HEALTHCHECK and the CLI. Public: it exposes nothing. */
export default defineEventHandler(() => ({ status: 'ok' }))
