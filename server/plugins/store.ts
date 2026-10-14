import { loadSecretKey } from '../utils/crypto'
import { ensureDataDir } from '../utils/data-dir'
import { migrateStore, openStore, setStore } from '../store/db'
import { setSecretKey } from '../utils/secrets'
import { setSessionSecret } from '../utils/auth'

export default defineNitroPlugin(async () => {
  const dir = ensureDataDir()
  const key = loadSecretKey(dir)
  setSecretKey(key)
  setSessionSecret(key)
  const db = openStore(dir)
  await migrateStore(db)
  setStore(db)
})
