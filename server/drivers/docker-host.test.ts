import { describe, expect, it } from 'vitest'
import { resolveConnectHost } from './docker-host'

describe('resolveConnectHost', () => {
  it('maps loopback names to the host alias in a container', () => {
    for (const h of ['localhost', '127.0.0.1', '::1', 'LocalHost']) {
      expect(resolveConnectHost(h, true)).toBe('host.docker.internal')
    }
  })
  it('keeps other hosts and everything outside a container', () => {
    expect(resolveConnectHost('db.example.com', true)).toBe('db.example.com')
    expect(resolveConnectHost('localhost', false)).toBe('localhost')
    expect(resolveConnectHost(null, true)).toBeNull()
  })
})
