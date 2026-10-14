import { describe, expect, it } from 'vitest'
import { isSystemNamespace } from './system-namespaces'

describe('isSystemNamespace', () => {
  it('flags the namespaces each dialect creates for itself', () => {
    expect(isSystemNamespace('postgres', 'pg_catalog')).toBe(true)
    expect(isSystemNamespace('postgres', 'pg_temp_3')).toBe(true)
    expect(isSystemNamespace('postgres', 'public')).toBe(false)
    expect(isSystemNamespace('mysql', 'performance_schema')).toBe(true)
    expect(isSystemNamespace('mysql', 'shop')).toBe(false)
    expect(isSystemNamespace('sqlite', 'main')).toBe(false)
  })
})
