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

/** Translates an API error into a message key under `errors.*`. */
export function useConnectionErrors() {
  const { t } = useI18n()
  return { message: (err: unknown) => t(`errors.${errorCode(err)}`) }
}
