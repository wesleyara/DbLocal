import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DBLOCAL_DATA_DIR) return env.DBLOCAL_DATA_DIR
  if (existsSync('/.dockerenv') && existsSync('/data')) return '/data'
  return join(homedir(), '.dblocal')
}

export function ensureDataDir(dir: string = resolveDataDir()): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}
