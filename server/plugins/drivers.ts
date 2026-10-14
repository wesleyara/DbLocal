import { getPoolManager } from '../drivers/pool-manager'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', () => getPoolManager().closeAll())
})
