import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PoolManager } from './pool-manager'
import { DriverError } from './errors'
import type { Driver, DriverConfig } from './types'

function fakeDriver(): Driver & { closed: boolean } {
  const driver = {
    dialect: 'postgres' as const,
    closed: false,
    testConnection: async () => ({ serverVersion: 'fake', latencyMs: 1 }),
    listDatabases: async () => [],
    listSchemas: async () => [],
    listRoutines: async () => ({ routines: [], triggers: [] }),
    readRows: async () => [],
    countRows: async () => 0,
    countGroups: async () => [],
    applyMutations: async () => [],
    openQuerySession: async () => {
      throw new Error('not used')
    },
    introspect: async (schema: string) => ({ dialect: 'postgres' as const, schema, tables: [], readAt: '' }),
    close: async () => {
      driver.closed = true
    },
  }
  return driver
}

const config = (id: string, database?: string): DriverConfig => ({ id, dialect: 'postgres', database })

describe('PoolManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reuses one driver per connection and database', async () => {
    const pools = new PoolManager()
    const factory = vi.fn(async () => fakeDriver())

    const a = await pools.get(config('c1', 'db'), factory)
    const b = await pools.get(config('c1', 'db'), factory)
    const other = await pools.get(config('c1', 'other'), factory)

    expect(a).toBe(b)
    expect(other).not.toBe(a)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(pools.size()).toBe(2)
  })

  it('deduplicates concurrent creation', async () => {
    const pools = new PoolManager()
    const factory = vi.fn(async () => fakeDriver())

    const [a, b] = await Promise.all([pools.get(config('c1'), factory), pools.get(config('c1'), factory)])

    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('closes a pool after the idle timeout', async () => {
    const pools = new PoolManager({ idleTimeoutMs: 1000 })
    const driver = await pools.get(config('c1'), async () => fakeDriver())

    vi.advanceTimersByTime(999)
    expect(pools.has('c1')).toBe(true)

    vi.advanceTimersByTime(1)
    await vi.runAllTimersAsync()
    expect(pools.has('c1')).toBe(false)
    expect((driver as ReturnType<typeof fakeDriver>).closed).toBe(true)
  })

  it('resets the idle timer on use', async () => {
    const pools = new PoolManager({ idleTimeoutMs: 1000 })
    const factory = async () => fakeDriver()
    await pools.get(config('c1'), factory)

    vi.advanceTimersByTime(900)
    await pools.get(config('c1'), factory)
    vi.advanceTimersByTime(900)
    expect(pools.has('c1')).toBe(true)
  })

  it('invalidate closes every pool of that connection only', async () => {
    const pools = new PoolManager()
    const d1 = (await pools.get(config('c1', 'a'), async () => fakeDriver())) as ReturnType<typeof fakeDriver>
    const d2 = (await pools.get(config('c1', 'b'), async () => fakeDriver())) as ReturnType<typeof fakeDriver>
    const keep = (await pools.get(config('c2'), async () => fakeDriver())) as ReturnType<typeof fakeDriver>

    await pools.invalidate('c1')

    expect(d1.closed).toBe(true)
    expect(d2.closed).toBe(true)
    expect(keep.closed).toBe(false)
    expect(pools.has('c1', 'a')).toBe(false)
    expect(pools.has('c2')).toBe(true)
  })

  it('does not cache a failed creation', async () => {
    const pools = new PoolManager()
    const failing = vi.fn(async () => {
      throw new DriverError('network', 'host unreachable')
    })
    await expect(pools.get(config('c1'), failing)).rejects.toMatchObject({ code: 'network' })
    await Promise.resolve()

    expect(pools.has('c1')).toBe(false)
    await pools.get(config('c1'), async () => fakeDriver())
    expect(pools.has('c1')).toBe(true)
  })

  it('closeAll closes everything', async () => {
    const pools = new PoolManager()
    const d = (await pools.get(config('c1'), async () => fakeDriver())) as ReturnType<typeof fakeDriver>

    await pools.closeAll()

    expect(d.closed).toBe(true)
    expect(pools.size()).toBe(0)
  })
})

describe('DriverError', () => {
  it('maps each code to an HTTP status', () => {
    expect(new DriverError('auth', 'bad password').httpStatus).toBe(401)
    expect(new DriverError('timeout', 'slow').httpStatus).toBe(504)
    expect(new DriverError('syntax', 'bad sql').httpStatus).toBe(400)
  })
})
