import { authEnabled, isLoopback } from '../../utils/auth'

export default defineEventHandler(() => {
  const host = process.env.DBLOCAL_HOST || process.env.NITRO_HOST || '127.0.0.1'
  return {
    authEnabled: authEnabled(),
    exposedWithoutPassword: !authEnabled() && !isLoopback(host),
  }
})
