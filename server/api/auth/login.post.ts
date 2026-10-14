import {
  authEnabled,
  createSessionToken,
  RateLimiter,
  safeEqual,
  SESSION_COOKIE,
} from '../../utils/auth'

const limiter = new RateLimiter(5, 60_000)

export default defineEventHandler(async (event) => {
  if (!authEnabled()) return { ok: true }
  const ip = getRequestIP(event, { xForwardedFor: false }) ?? 'unknown'
  if (!limiter.take(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Try again later.' })
  }
  const body = await readBody<{ password?: string }>(event)
  if (typeof body?.password !== 'string' || !safeEqual(body.password, process.env.DBLOCAL_PASSWORD!)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password' })
  }
  setCookie(event, SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return { ok: true }
})
