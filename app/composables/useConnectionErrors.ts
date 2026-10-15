const KNOWN = new Set([
  'auth',
  'network',
  'timeout',
  'syntax',
  'constraint',
  'permission',
  'unknown',
  'notFound',
  'invalid',
])

/** Reads the normalised code the API put in the error body (`data.code`), if any. */
export function errorCode(err: unknown): string {
  const body = (err as { data?: { data?: { code?: string }; statusCode?: number } })?.data
  if (body?.statusCode === 400) return 'invalid'
  if (body?.statusCode === 404) return 'notFound'
  const code = body?.data?.code
  return code && KNOWN.has(code) ? code : 'unknown'
}

/**
 * The server's own message for errors that carry no useful translation on their own
 * (a missing SQLite file, a TLS certificate problem, an unreachable SSH target).
 */
export function errorDetail(err: unknown): string | null {
  const body = (err as { data?: { statusMessage?: string; statusCode?: number } })?.data
  if (!body || body.statusCode === 400 || body.statusCode === 404) return null
  const detail = body.statusMessage?.trim()
  return detail && detail !== 'Server Error' ? detail : null
}

/** Translates an API error into a message under `errors.*`, followed by the server detail when there is one. */
export function useConnectionErrors() {
  const { t } = useI18n()
  return {
    message: (err: unknown) => {
      const code = errorCode(err)
      const base = t(`errors.${code}`)
      const detail = errorDetail(err)
      if (!detail) return base
      // "Something went wrong." adds nothing next to a specific server message.
      return code === 'unknown' ? detail : `${base} ${detail}`
    },
  }
}
