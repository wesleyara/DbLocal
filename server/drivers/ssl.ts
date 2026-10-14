import type { SslOptions } from './types'

/**
 * TLS options shared by `pg` and `mysql2`. `require` encrypts without checking the server
 * certificate; `verify-ca` checks the chain but not the host name; `verify-full` checks both.
 */
export function tlsOptions(ssl: SslOptions | undefined): Record<string, unknown> | false | undefined {
  if (!ssl || ssl.mode === 'disable') return undefined
  const base: Record<string, unknown> = {
    ...(ssl.ca ? { ca: ssl.ca } : {}),
    ...(ssl.cert ? { cert: ssl.cert } : {}),
    ...(ssl.key ? { key: ssl.key } : {}),
  }
  switch (ssl.mode) {
    case 'require':
      return { ...base, rejectUnauthorized: false }
    case 'verify-ca':
      return { ...base, rejectUnauthorized: true, checkServerIdentity: () => undefined }
    case 'verify-full':
      return { ...base, rejectUnauthorized: true }
  }
}
