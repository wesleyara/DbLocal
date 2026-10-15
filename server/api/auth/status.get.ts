import { authEnabled, isLoopback, listedHost } from '../../utils/auth'

export default defineEventHandler((event) => {
  const bind = process.env.DBLOCAL_HOST || process.env.NITRO_HOST || '127.0.0.1'
  // Bound to a non-loopback address (e.g. 0.0.0.0 in Docker) is only a concern when the page is
  // actually reached through a network name; localhost and names the user listed in DBLOCAL_ALLOWED_HOSTS are not exposed.
  const host = getRequestHeader(event, 'host') ?? ''
  const viaLocalName =
    /^(localhost|[^.]+\.localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) || listedHost(host)
  return {
    authEnabled: authEnabled(),
    exposedWithoutPassword: !authEnabled() && !isLoopback(bind) && !viaLocalName,
  }
})
