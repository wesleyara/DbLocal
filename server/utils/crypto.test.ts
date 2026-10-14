import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, loadSecretKey } from './crypto'

const key = Buffer.alloc(32, 7)

describe('crypto', () => {
  it('roundtrips', () => {
    expect(decrypt(encrypt('s3cret ✓', key), key)).toBe('s3cret ✓')
  })
  it('uses a fresh IV each call', () => {
    expect(encrypt('a', key)).not.toBe(encrypt('a', key))
  })
  it('fails on tampered data', () => {
    const [v, iv, tag, data] = encrypt('hello', key).split(':')
    const bad = Buffer.from(data!, 'base64')
    bad[0] = bad[0]! ^ 1
    expect(() => decrypt([v, iv, tag, bad.toString('base64')].join(':'), key)).toThrow()
  })
  it('generates a 0600 key once and reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dbl-'))
    const a = loadSecretKey(dir, {})
    const b = loadSecretKey(dir, {})
    expect(a.equals(b)).toBe(true)
    expect(statSync(join(dir, 'secret.key')).mode & 0o777).toBe(0o600)
  })
  it('derives the key from DBLOCAL_SECRET', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dbl-'))
    expect(loadSecretKey(dir, { DBLOCAL_SECRET: 'x' }).length).toBe(32)
  })
})
