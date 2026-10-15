import { authEnabled, hostAllowed, originAllowed, SESSION_COOKIE, verifySessionToken } from '../utils/auth'

const PUBLIC = ['/login', '/api/health', '/api/auth/login', '/_i18n/', '/_nuxt/', '/__nuxt', '/_fonts/', '/favicon']

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!
  const method = event.method

  if (!hostAllowed(getRequestHeader(event, 'host'))) {
    throw createError({ statusCode: 403, statusMessage: 'Host not allowed' })
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!originAllowed(getRequestHeader(event, 'origin'), getRequestHeader(event, 'host'))) {
      throw createError({ statusCode: 403, statusMessage: 'Cross-origin request blocked' })
    }
  }

  if (!authEnabled()) return
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return

  if (verifySessionToken(getCookie(event, SESSION_COOKIE))) return

  if (path.startsWith('/api/')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return sendRedirect(event, '/login', 302)
})
