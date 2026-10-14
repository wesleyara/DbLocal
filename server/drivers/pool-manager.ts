import type { Driver, DriverConfig, DriverFactory } from './types'

export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000

export interface PoolManagerOptions {
  idleTimeoutMs?: number
}

interface Entry {
  connectionId: string
  promise: Promise<Driver>
  timer?: ReturnType<typeof setTimeout>
}

/**
 * Caches one driver per connection + database. Creation is deduplicated while in flight,
 * an entry is closed after `idleTimeoutMs` without use, and `invalidate` closes every
 * entry of a connection (used when that connection is edited or deleted).
 */
export class PoolManager {
  private readonly entries = new Map<string, Entry>()
  private readonly idleTimeoutMs: number

  constructor(options: PoolManagerOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  }

  async get(config: DriverConfig, factory: DriverFactory, database = config.database ?? ''): Promise<Driver> {
    const key = `${config.id}:${database}`
    let entry = this.entries.get(key)
    if (!entry) {
      const created: Entry = {
        connectionId: config.id,
        promise: factory(config, database || undefined),
      }
      this.entries.set(key, created)
      // A failed creation must not stay cached.
      created.promise.catch(() => {
        if (this.entries.get(key) === created) this.entries.delete(key)
      })
      entry = created
    }
    this.touch(key, entry)
    return entry.promise
  }

  has(connectionId: string, database = ''): boolean {
    return this.entries.has(`${connectionId}:${database}`)
  }

  size(): number {
    return this.entries.size
  }

  /** Closes and forgets every pool of a connection. */
  async invalidate(connectionId: string): Promise<void> {
    const keys = [...this.entries.keys()].filter((k) => this.entries.get(k)?.connectionId === connectionId)
    await Promise.all(keys.map((k) => this.remove(k)))
  }

  /** Closes all pools, e.g. on Nitro shutdown. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((k) => this.remove(k)))
  }

  private touch(key: string, entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      void this.remove(key)
    }, this.idleTimeoutMs)
    entry.timer.unref?.()
  }

  private async remove(key: string): Promise<void> {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    if (entry.timer) clearTimeout(entry.timer)
    try {
      const driver = await entry.promise
      await driver.close()
    } catch {
      // Creation failed or close failed: the entry is already gone, nothing else to release.
    }
  }
}

let manager: PoolManager | undefined

export function getPoolManager(): PoolManager {
  manager ??= new PoolManager()
  return manager
}
