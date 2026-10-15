import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_COOKIE = 'dblocal_session'

let sessionSecret: Buffer = randomBytes(32)

export function setSessionSecret(s: Buffer): void {
  sessionSecret = s
}

export function authEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DBLOCAL_PASSWORD)
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'dblocal').update(a).digest()
  const hb = createHmac('sha256', 'dblocal').update(b).digest()
  return timingSafeEqual(ha, hb)
}

const sign = (payload: string): string =>
  createHmac('sha256', sessionSecret).update(payload).digest('base64url')

export function createSessionToken(now = Date.now()): string {
  const payload = String(now + SESSION_TTL_MS)
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = sign(payload)
  if (sig.length !== expected.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
  return Number(payload) > now
}

export function isLoopback(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
}

/**
 * Without a password, only Host headers that cannot come from DNS rebinding are served: loopback names,
 * IP literals and the names in `DBLOCAL_ALLOWED_HOSTS` (comma separated). A rebound page carries its own
 * domain in Host. With a password the session cookie never reaches such a page, so any Host is fine.
 */
export function hostAllowed(host: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!host || authEnabled(env)) return true // HTTP/1.0 clients may omit Host; browsers never do
  const name = hostName(host)
  if (name === 'localhost' || name.endsWith('.localhost')) return true
  if (name.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true
  return listedHost(host, env)
}

/** True when the Host header names an entry of `DBLOCAL_ALLOWED_HOSTS`. */
export function listedHost(host: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!host) return false
  const extra = (env.DBLOCAL_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return extra.includes(hostName(host))
}

function hostName(host: string): string {
  const h = host.trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.replace(/:\d*$/, '').replace(/\.$/, '')
}

export function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true // non-browser clients (curl) carry no Origin
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()
  constructor(
    private max = 5,
    private windowMs = 60_000,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const e = this.hits.get(key)
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    e.count++
    return e.count <= this.max
  }
}
