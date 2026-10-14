import { describe, expect, it } from 'vitest'
import { tlsOptions } from './ssl'

describe('tlsOptions', () => {
  it('is off when disabled or unset', () => {
    expect(tlsOptions(undefined)).toBeUndefined()
    expect(tlsOptions({ mode: 'disable' })).toBeUndefined()
  })

  it('require encrypts without checking the certificate', () => {
    expect(tlsOptions({ mode: 'require' })).toEqual({ rejectUnauthorized: false })
  })

  it('verify-ca checks the chain but not the host name', () => {
    const opts = tlsOptions({ mode: 'verify-ca', ca: 'PEM' }) as Record<string, unknown>
    expect(opts.rejectUnauthorized).toBe(true)
    expect(opts.ca).toBe('PEM')
    expect((opts.checkServerIdentity as () => undefined)()).toBeUndefined()
  })

  it('verify-full checks the chain and the host name', () => {
    const opts = tlsOptions({ mode: 'verify-full', ca: 'PEM' }) as Record<string, unknown>
    expect(opts).toEqual({ ca: 'PEM', rejectUnauthorized: true })
  })

  it('adds the client certificate and key when given', () => {
    expect(tlsOptions({ mode: 'verify-full', cert: 'C', key: 'K' })).toEqual({
      cert: 'C',
      key: 'K',
      rejectUnauthorized: true,
    })
  })
})
